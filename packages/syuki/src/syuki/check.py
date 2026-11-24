"""照合（syuki check）と impact。違反は終了コード 1、確認だけなら 0。"""
from __future__ import annotations

import importlib.util
import os
import re
import subprocess
import sys
import tomllib
from collections import Counter
from pathlib import Path

from .query import ev_data, fmt_event, minutes
from .state import replay
from .work import ANCHOR, KINDS, THREAD_KINDS, Point, Work, names, plain

SUFFIXES = ("監", "院", "局", "官", "庁", "塔", "寮", "会所", "省", "署")  # 制度・役職・施設らしい語の末尾
RASHII_LIMIT = 3


LEVEL_JA = {"violation": "違反", "confirm": "確認"}
KIND_JA = {  # 照合の種類の、人が読む出力での言い方
    "yaml_shape": "YAML の形", "lost_anchor": "引用の迷子", "anchor_ambiguous": "引用", "scene_count": "場面の数",
    "order": "記録の時点の並び", "unknown_name": "登録していない名前", "event_kind": "出来事の種類", "event_shape": "出来事の形",
    "stage": "好意の段階", "document_cite": "文書の引用", "item": "持ち物", "thread": "伏線", "keep": "残す文",
    "date": "日時", "travel": "移動", "term": "用語", "rashii": "らしい", "unregistered_word": "登録していない語",
    "unknown_knowledge": "知らないはずの知識", "plugin": "checks.py",
}


class Report:
    def __init__(self):
        self.items: list[dict] = []
        self.notices: list[str] = []  # 飛ばした照合など

    def add(self, kind: str, msg: str, where: str | None = None, confirm: bool = False):
        self.items.append({"level": "confirm" if confirm else "violation", "kind": kind, "msg": msg, "where": where})

    @property
    def violations(self) -> int:
        return sum(1 for i in self.items if i["level"] == "violation")

    def text(self) -> list[str]:
        out = [f"{LEVEL_JA[i['level']]}［{KIND_JA.get(i['kind'], i['kind'])}］{i['where'] + ' ' if i['where'] else ''}{i['msg']}" for i in self.items]
        out += [f"知らせ: {n}" for n in self.notices]
        out.append(f"違反 {self.violations} 件、確認 {len(self.items) - self.violations} 件")
        return out


def run(work: Work) -> Report:
    r = Report()
    for file, msg in work.problems:
        r.add("yaml_shape", msg, file)
    for f in (check_anchors, check_scenes, check_order, check_names, check_documents, check_items, check_threads,
              check_keep, check_dates, check_terms, check_unregistered, check_knowledge, check_plugin):
        f(work, r)
    return r


def where_ev(work: Work, row: dict, name: str) -> str:
    return f"{work.ledger_file(name, row['_vol'])} {work.label(row['_pt'])}"


def check_anchors(work: Work, r: Report):
    for file, anchor, vol in work.anchors():
        try:
            hit = work.resolve(anchor, vol)
        except ValueError as e:
            r.add("lost_anchor", f"{anchor}: {e}", file)
            continue
        if hit.count > 1:
            r.add("anchor_ambiguous", f"{anchor} が本文に {hit.count} か所。最初の {hit.where} を使う", file, confirm=True)


def check_scenes(work: Work, r: Report):
    for ch in work.chapters:
        rows = [s["_pt"].scene for s in work.scenes if (s["_pt"].vi, s["_pt"].ci) == (ch.vi, ch.ci)]
        file = work.ledger_file("scenes", ch.vol)
        if not rows:
            r.add("scene_count", f"{ch.id} が場面の表に無い（本文は {ch.scenes} 場面）", file, confirm=True)
            continue
        for n, c in Counter(rows).items():
            if c > 1:
                r.add("scene_count", f"{ch.id}:{n} が {c} 行ある", file)
        if len(set(rows)) != ch.scenes:
            r.add("scene_count", f"{ch.id} は場面の表に {len(set(rows))} 場面、本文（{ch.rel}）は {ch.scenes} 場面", file)


def check_order(work: Work, r: Report):
    for name in ("scenes", "events"):
        prev = None
        for row in getattr(work, name):
            if prev and prev["_vol"] == row["_vol"] and row["_pt"] < prev["_pt"]:
                r.add("order", f"{work.label(row['_pt'])} が {work.label(prev['_pt'])} のあとにある。時点の順に並べる",
                      work.ledger_file(name, row["_vol"]))
            prev = row


def check_names(work: Work, r: Report):
    stages = work.conf.get("stages") or {}
    threads = {t.get("id") for t in work.rows("threads")}
    people, places, items = work.people, work.place_names, work.item_names

    def need(name, table, what, where):
        if name is not None and name not in table:
            r.add("unknown_name", f"{what}「{name}」が台帳に無い", where)

    for sc in work.scenes:
        w = where_ev(work, sc, "scenes")
        for n in sc.get("cast") or []:
            need(n, people, "人物", w)
        need(sc.get("place"), places, "場所", w)
    for e in work.events:
        w, kind = where_ev(work, e, "events"), e.get("kind")
        if kind not in KINDS:
            r.add("event_kind", f"種類「{kind}」は {' / '.join(KINDS)} のどれか", w)
            continue
        for k in KINDS[kind]:
            if not e.get(k):
                r.add("event_shape", f"{kind} には {k} が要る", w)
        for n in names(e.get("who")):
            need(n, people, "人物", w)
        if kind == "feel":
            need(e.get("to"), people, "人物", w)
        elif kind == "move":
            need(e.get("what"), items, "持ち物", w)
            for k in ("to", "from"):
                if e.get(k) is not None and e[k] not in people and e[k] not in places:
                    r.add("unknown_name", f"{k}「{e[k]}」が人物にも場所にも無い", w)
        elif kind in THREAD_KINDS:
            need(e.get("what"), threads, "伏線", w)
        elif kind == "stage":
            for n in names(e.get("who")):
                key = next((h for h in stages if people.get(h) == people.get(n)), None)
                if key is None:
                    r.add("stage", f"{n} の段階が syuki.yml の stages に無い", w)
                elif e.get("what") not in stages[key]:
                    r.add("stage", f"段階「{e.get('what')}」は {'→'.join(stages[key])} のどれか", w)
    for i in work.items:
        if i.get("holder") and i["holder"] not in people and i["holder"] not in places:
            r.add("unknown_name", f"{i['name']} の holder「{i['holder']}」が人物にも場所にも無い", work.ledger_file("items"))
    for s in work.rows("secrets"):
        for n in s.get("known") or []:
            need(n, people, "人物", work.ledger_file("secrets"))
    for rt in work.routes:
        for k in ("from", "to"):
            need(rt.get(k), places, "場所", work.ledger_file("places"))
    for h in stages:
        need(h, people, "人物", work.conf_path.name)


def fragments(line: str) -> list[str]:
    """本文の行から、文書の引用にあたる字を取り出す（『…』の中。『が無い行は行全体）。"""
    if "『" not in line:
        return [line.strip().replace("』", "")]  # 何行にもわたる文書の終わりの行（「　当主』」）
    return [m.split("』")[0] for m in line.split("『")[1:]]


def check_documents(work: Work, r: Report):
    for d in work.rows("documents"):
        body = plain((d.get("text") or "").replace("『", "").replace("』", ""))
        for a in d.get("cites") or []:
            try:
                hit = work.resolve(a, work.volumes[0] if len(work.volumes) == 1 else None)
            except ValueError:
                continue  # 迷子は check_anchors が出す
            frags = fragments(hit.ch.lines[hit.line - 1])
            quote = plain(ANCHOR.match(a.strip())["quote"].replace("『", "").replace("』", ""))
            # 一行に別の文書の引用が並ぶことがあるので、引用の字を含む『』だけを見る
            for frag in [f for f in frags if quote in plain(f) or plain(f) in quote] or frags:
                if plain(frag) and plain(frag) not in body:
                    r.add("document_cite", f"「{frag}」が {d.get('id')} の正本と合わない", hit.where)


def check_items(work: Work, r: Report):
    holder = {i["name"]: work.people.get(i.get("holder"), i.get("holder")) for i in work.items}
    seen: dict[tuple, str] = {}
    for e in sorted(work.events, key=lambda e: e["_pt"]):
        if e.get("kind") != "move":
            continue
        item = work.item_names.get(e.get("what"), e.get("what"))
        to = work.people.get(e.get("to"), e.get("to"))
        w = where_ev(work, e, "events")
        if e.get("from") is not None:
            frm = work.people.get(e["from"], e["from"])
            if frm != holder.get(item):
                r.add("item", f"{item} を {frm} から移したが、その時は {holder.get(item) or '持ち主不明'} が持っている", w)
        key = (item, e["_pt"])
        if key in seen and seen[key] != to:
            r.add("item", f"{item} が同じ場面で {seen[key]} と {to} の二か所にある", w)
        seen[key] = to
        holder[item] = to


def check_threads(work: Work, r: Report):
    last = work.end_of(work.chapters[-1]) if work.chapters else None
    s = replay(work)
    for t in work.rows("threads"):
        for p in t.get("plan") or []:
            if p.get("do") != "payoff":
                continue
            try:
                pt = work.later_point(p.get("at"))
            except ValueError as e:
                r.add("thread", f"{t.get('id')} の予定 {p.get('at')}: {e}", work.ledger_file("threads"))
                continue
            done = any(x["kind"] == "payoff" for x in s.threads.get(t.get("id"), []))
            if pt and last and pt <= last and not done:
                r.add("thread", f"{t.get('id')} は {work.label(pt)} で回収の予定だが、回収の記録が無い", work.ledger_file("threads"))


def style_pack(base: Path, root: Path) -> str:
    """使う文体パックの名前。作品の roles.toml、ハーネスの roles.toml の [style] pack の順に引き、無ければ general。"""
    for f in (root / "roles.toml", base / "roles.toml"):
        if f.is_file() and (pack := tomllib.loads(f.read_text(encoding="utf-8")).get("style", {}).get("pack")):
            return pack
    return "general"


def lint_scripts(root: Path) -> Path | None:
    """文体パックの lint のフォルダ（skills/<パック>/scripts）を、作品から上へ、無ければ syuki の置き場所から上へたどって探す。"""
    here = Path(__file__).resolve()
    for d in [root, *root.parents, *here.parents]:
        for base in (".agents", "harness"):  # 作品のリポジトリに写したハーネスか、このリポジトリの harness/
            b = d / base
            if b.is_dir() and (p := b / "skills" / style_pack(b, root) / "scripts").is_dir():
                return p
    return None


def check_keep(work: Work, r: Report):
    keep = work.root / "style" / "keep.md"
    scripts = lint_scripts(work.root)
    if not keep.is_file():
        return
    if scripts is None:
        r.notices.append("文体パックの scripts が見つからないので keep.md の照合を飛ばした")
        return
    sys.path.insert(0, str(scripts))
    keep_bytecode, sys.dont_write_bytecode = sys.dont_write_bytecode, True  # スキルのフォルダに __pycache__ を作らない
    try:
        import keep_check
    finally:
        sys.path.pop(0)
        sys.dont_write_bytecode = keep_bytecode
    entries = keep_check.load(str(keep))
    for ch in work.chapters:
        for e in keep_check.check(entries, str(ch.path), "\n".join(ch.lines)):
            r.add("keep", f"「{e['text']}」が {ch.rel} に無い（{e['reason']}）", f"style/keep.md:{e['line']}")


def check_dates(work: Work, r: Report):
    routes = {}
    for rt in work.routes:
        if rt.get("minutes"):
            routes[frozenset((rt.get("from"), rt.get("to")))] = rt
    ordered = sorted(work.scenes, key=lambda s: s["_pt"])
    for a, b in zip(ordered, ordered[1:]):
        if a["_vol"] != b["_vol"] or a.get("day") is None or b.get("day") is None:
            continue
        w = where_ev(work, b, "scenes")
        if b["day"] < a["day"]:
            r.add("date", f"{b['day']}日目が前の場面（{work.label(a['_pt'])}、{a['day']}日目）より前", w)
            continue
        ta, tb = minutes(a.get("time")), minutes(b.get("time"))
        if b["day"] != a["day"] or ta is None or tb is None:
            continue
        if tb < ta:
            r.add("date", f"{b.get('time')} が前の場面（{work.label(a['_pt'])}、{a.get('time')}）より前", w)
            continue
        pa, pb = work.place_names.get(a.get("place")), work.place_names.get(b.get("place"))
        rt = routes.get(frozenset((pa, pb)))
        if pa != pb and rt and tb - ta < rt["minutes"]:
            r.add("travel", f"{pa}→{pb} は {rt.get('time') or str(rt['minutes']) + '分'} かかるが、前の場面から {tb - ta} 分", w)


def check_terms(work: Work, r: Report):
    file = work.ledger_file("terms")
    one = work.volumes[0] if len(work.volumes) == 1 else None
    new_in: Counter = Counter()
    for t in work.rows("terms"):
        term = t.get("term")
        if not term:
            continue
        limit = None
        if t.get("explained"):
            try:
                hit = work.resolve(t["explained"], one)
            except ValueError:
                hit = None  # 迷子は check_anchors が出す
            if hit:
                limit = (hit.ch.vi, hit.ch.ci, hit.line)
                if not t.get("basic"):
                    new_in[(hit.ch.vol, hit.ch.id)] += 1
        first = first_use(work, term)
        if limit and first and (first[0].vi, first[0].ci, first[1]) < limit:
            r.add("term", f"「{term}」を説明（{t['explained']}）より前に使った", f"{first[0].rel}:{first[1]}")
        if t.get("hidden_until"):
            try:
                until = work.later_point(t["hidden_until"], one)
            except ValueError as e:
                r.add("term", f"「{term}」の hidden_until: {e}", file)
                continue
            for ch, line in uses(work, term):
                if until is None or Point(ch.vi, ch.ci, ch.scene_of(line)) < until:
                    r.add("term", f"「{term}」は {t['hidden_until']} まで出さない", f"{ch.rel}:{line}")
                    break
    for (vol, cid), n in new_in.items():
        if n > 1:
            r.add("term", f"{vol}/{cid} で新しい用語が {n} 個（一章に一つまで。古い語は basic: true）", file)
    for ch in work.chapters:
        n = sum(pl.count("らしい") for _, _, pl in ch.body_lines())
        if n > RASHII_LIMIT:
            r.add("rashii", f"「らしい」が {n} 回（一章 {RASHII_LIMIT} 回まで）", ch.rel)


def uses(work: Work, term: str):
    p = plain(term)
    for ch in work.chapters:
        for i, _, pl in ch.body_lines():
            if p in pl:
                yield ch, i


def first_use(work: Work, term: str):
    return next(uses(work, term), None)


def check_unregistered(work: Work, r: Report):
    try:
        from sudachipy import dictionary, tokenizer
    except ImportError:
        r.notices.append("sudachipy が無いので未登録語の照合を飛ばした（uv run --extra ja で入る）")
        return
    d = dictionary.Dictionary()
    tok = d.tokenizer() if hasattr(d, "tokenizer") else d.create()
    mode = tokenizer.Tokenizer.SplitMode.C
    known = work.ledger_text()
    seen = set()
    for ch in work.chapters:
        for i, _, pl in ch.body_lines():
            for word in compounds(tok.tokenize(pl, mode)):
                if word.endswith(SUFFIXES) and len(word) >= 2 and word not in known and word not in seen:
                    seen.add(word)
                    r.add("unregistered_word", f"「{word}」が台帳と設定集に無い", f"{ch.rel}:{i}", confirm=True)


def compounds(tokens) -> list[str]:
    """続いた名詞（と接尾辞）をつないだ語。副詞にもなる名詞（「結局」など）で終わるものは外す。"""
    out, cur, last = [], "", None
    for m in [*tokens, None]:
        pos = m.part_of_speech() if m else ("",)
        if m and (pos[0] == "名詞" and pos[1] != "数詞" or pos[0] == "接尾辞"):
            cur, last = cur + m.surface(), pos
            continue
        if cur and "副詞可能" not in (last or ()):
            out.append(cur)
        cur, last = "", None
    return out


def load_profile(work: Work) -> dict:
    path = work.root / work.conf.get("style", "style/profile.toml")
    return tomllib.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def check_knowledge(work: Work, r: Report):
    secrets = [s for s in work.rows("secrets") if s.get("markers")]
    if not secrets:
        return
    pov = load_profile(work).get("pov", {})
    narrator = (pov.get("names") or [None])[0] if pov.get("mode") == "一人称" else None
    narrator = work.people.get(narrator, narrator)
    exclude = pov.get("exclude") or []
    cache: dict[Point, object] = {}
    for ch in work.chapters:
        own_pov = any(x in ch.id for x in exclude)
        for i, raw, pl in ch.body_lines():
            hits = [(s, m) for s in secrets for m in s["markers"] if plain(m) in pl]
            if not hits:
                continue
            if pl.startswith(("「", "『")):
                speaker = guess_speaker(work, ch, i, None if own_pov else narrator, pov.get("first_person"))
            else:
                speaker = None if own_pov else narrator
            if not speaker:
                continue
            pt = Point(ch.vi, ch.ci, ch.scene_of(i))
            if pt not in cache:
                cache[pt] = replay(work, pt, inclusive=True)
            for s, m in hits:
                if not cache[pt].knows_secret(speaker, s["id"]):
                    r.add("unknown_knowledge", f"{speaker} は {work.label(pt)} の時点で「{s['id']}」を知らないのに「{m}」と出た",
                          f"{ch.rel}:{i}", confirm=True)


def guess_speaker(work: Work, ch, i: int, narrator, first_person) -> str | None:
    """台詞の話し手を、次（無ければ前）の地の文でいちばん先に出る名前から推す。"""
    order = sorted(work.people, key=len, reverse=True)
    for step in (1, -1):
        j = i - 1 + step
        while 0 <= j < len(ch.plain) and not ch.plain[j]:
            j += step
        if not (0 <= j < len(ch.plain)) or ch.plain[j].startswith(("「", "『")) or BREAK_PLAIN.match(ch.plain[j]):
            continue
        text, found = ch.plain[j], []
        for n in order:
            pos = text.find(n)
            if pos >= 0:
                found.append((pos, work.people[n]))
                text = text.replace(n, "＿" * len(n))
        if narrator and first_person and first_person in text:
            found.append((text.find(first_person), narrator))
        if found:
            return min(found)[1]
    return None


BREAK_PLAIN = re.compile(r"^＊$")


def check_plugin(work: Work, r: Report):
    """作品だけの照合 ledger/checks.py の check(work, report) を回す。"""
    path = work.ledger_dir / "checks.py"
    if not path.is_file():
        return
    spec = importlib.util.spec_from_file_location("syuki_work_checks", path)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        mod.check(work, r)
    except Exception as e:  # noqa: BLE001 — 作品の照合が落ちても、ほかの結果は出す
        r.add("plugin", f"{type(e).__name__}: {e}", path.relative_to(work.root).as_posix())


HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def impact(work: Work, rng: str):
    """本文の差分から、迷子になった引用と、変えた場面の出来事に頼る後ろの出来事を挙げる。"""
    mdir = work.conf.get("manuscript", "manuscript")
    cmd = ["git", "-C", str(work.root), "diff", "--relative", "-U0", rng, "--", mdir]
    diff = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if diff.returncode != 0 and "GIT_CONFIG_GLOBAL" not in os.environ:
        # サンドボックス等でグローバル git config が読めない環境向けのフォールバック
        diff = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              env={**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null"})
    if diff.returncode != 0:
        raise ValueError(f"git diff が通らない: {diff.stderr.strip()}")
    by_rel = {c.rel: c for c in work.chapters}
    changed: dict[Point, list[int]] = {}
    ch = None
    for x in diff.stdout.split("\n"):
        if x.startswith("+++ "):
            ch = by_rel.get(x[6:] if x.startswith("+++ b/") else None)
        m = HUNK.match(x)
        if m and ch:
            start, n = int(m[1]), int(m[2] if m[2] is not None else 1)
            for line in range(start, start + max(n, 1)):
                if line <= len(ch.lines):
                    changed.setdefault(Point(ch.vi, ch.ci, ch.scene_of(line)), []).append(line)
    r = Report()
    check_anchors(work, r)
    lost = [i for i in r.items if i["kind"] == "lost_anchor"]
    here = [e for e in work.events if e["_pt"] in changed]
    subjects = {e.get("what") for e in here}
    later = [e for e in work.events if e.get("what") in subjects and any(e["_pt"] > p for p in changed)]
    data = {
        "changed": [{"at": work.label(p), "lines": lines} for p, lines in sorted(changed.items())],
        "lost": lost, "events": [ev_data(work, e) for e in here], "dependents": [ev_data(work, e) for e in later],
    }
    out = ["## 変えた場面"] + [f"- {work.label(p)}（{work.ch_of(p).rel}:{lines[0]}-{lines[-1]}）" for p, lines in sorted(changed.items())]
    out += ["## 迷子になった引用"] + [f"- {i['where']} {i['msg']}" for i in lost]
    out += ["## 変えた場面の出来事"] + [f"- {work.label(e['_pt'])} {fmt_event(work, e)}" for e in here]
    out += ["## 頼っている後ろの出来事"] + [f"- {work.label(e['_pt'])} {fmt_event(work, e)}" for e in later]
    return data, out, bool(lost)
