"""引くコマンド: brief・search・state・knows・where・timeline・recap。各関数は (データ, 文字の行) を返す。"""
from __future__ import annotations

import re
from types import SimpleNamespace

from .cards import card, markdown_hits
from .state import State, replay
from .work import POINT, THREAD_KINDS, NotWritten, Point, Work, ja, names, plain, reader_text

TIMES = {"夜明け": 300, "日の出": 360, "朝": 420, "午前": 540, "昼前": 660, "昼": 720, "昼休み": 720, "昼すぎ": 780,
         "午後": 840, "放課後": 930, "夕方": 1020, "日暮れ": 1080, "晩": 1140, "夜": 1260, "夜中": 1440}
LIMIT = 30  # search の一区分で出す件数


def minutes(time) -> int | None:
    """「17:00」か「夕方」を、その日の分に。分からなければ None。"""
    if not time:
        return None
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(time))
    return int(m[1]) * 60 + int(m[2]) if m else TIMES.get(str(time))


def when(sc: dict) -> str:
    return " ".join(x for x in [f"{sc['day']}日目" if sc.get("day") is not None else "", sc.get("time") or ""] if x)


def scene_row(work: Work, pt: Point) -> dict | None:
    return next((s for s in work.scenes if s["_pt"] == pt), None)


def fmt_event(work: Work, e: dict) -> str:
    kind, what = e.get("kind"), e.get("what")
    who = "・".join(names(e.get("who")))
    text = {
        "know": f"{who}が知る: {what}",
        "feel": f"{who}→{e.get('to')}: {what}",
        "move": f"{what}: {e.get('from') or ''}→{e.get('to')}",
        "stage": f"{who}の段階: {what}",
    }.get(kind, f"伏線「{what}」を{ja(kind)}" if kind in THREAD_KINDS else f"{kind}: {what}")
    return text + (f"（{e['note']}）" if e.get("note") else "")


def ev_data(work: Work, e: dict) -> dict:
    return {"at": work.label(e["_pt"]), **{k: v for k, v in e.items() if not k.startswith("_")}}


def secret_ids(work: Work) -> list[str]:
    return [s["id"] for s in work.rows("secrets") if "id" in s]


def person_state(work: Work, s: State, who: str) -> dict:
    lab = lambda pt: work.label(pt) if pt else "はじめから"  # noqa: E731
    known = {k["what"] for k in s.knows.get(who, [])}
    d = {
        "name": who,
        "place": s.place.get(who, {}).get("place"),
        "place_at": lab(s.place[who]["at"]) if who in s.place else None,
        "knows": [{"what": k["what"], "at": lab(k["at"])} for k in s.knows.get(who, [])],
        "unknown_secrets": [x for x in secret_ids(work) if x not in known],
        "feels": [{"to": t, "what": f["what"], "at": lab(f["at"])} for t, f in s.feels.get(who, {}).items()],
        "items": s.items_of(who),
    }
    if who in s.stage:
        d["stage"] = {"what": s.stage[who]["what"], "at": lab(s.stage[who]["at"])}
    return d


def person_lines(d: dict) -> list[str]:
    out = [f"- {d['name']}" + (f"（居場所: {d['place']} {d['place_at']}）" if d["place"] else "")]
    if d["knows"]:
        out.append("  知っている: " + "、".join(f"{k['what']}（{k['at']}）" for k in d["knows"]))
    if d["unknown_secrets"]:
        out.append("  知らない秘密: " + "、".join(d["unknown_secrets"]))
    if d["feels"]:
        out.append("  気持ち: " + "、".join(f"{f['to']}→{f['what']}（{f['at']}）" for f in d["feels"]))
    if d["items"]:
        out.append("  持ち物: " + "、".join(d["items"]))
    if d.get("stage"):
        out.append(f"  好意の段階: {d['stage']['what']}（{d['stage']['at']}）")
    return out


def notes_section(work: Work, ch, scene: int) -> list[str]:
    """筋道メモ ledger/<巻>/notes/<章>.md。「## <場面>」の節があればそこだけ。"""
    path = work.ledger_dir / ch.vol / "notes" / f"{ch.id}.md"
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8").split("\n")
    start = next((i for i, x in enumerate(lines) if re.fullmatch(rf"##\s*{scene}\b.*", x)), None)
    if start is None:
        return [x for x in lines if x.strip()]
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return [x for x in lines[start + 1:end] if x.strip()]


def brief(work: Work, pt: Point):
    pt = pt if pt.scene else Point(pt.vi, pt.ci, 1)
    ch = work.ch_of(pt)
    label = work.label(pt)
    sc = scene_row(work, pt) or {}
    s = replay(work, pt)
    cast = [work.people.get(n, n) for n in sc.get("cast") or []]
    text = card(work, ch, pt.scene, sc.get("card"))
    blob = " ".join(text) + (sc.get("summary") or "")
    prev = max((x for x in work.scenes if x["_pt"] < pt), key=lambda x: x["_pt"], default=None)
    place = next((p for p in work.places_list if p["name"] == work.place_names.get(sc.get("place"), sc.get("place"))), None)
    routes = [r for r in work.routes if prev and {r.get("from"), r.get("to")} == {prev.get("place"), sc.get("place")}]
    docs = [d for d in work.rows("documents") if any(n and n in blob for n in [d.get("title"), d.get("id"), *(d.get("aliases") or [])])
            or any(_cited_in(work, a, pt) for a in d.get("cites") or [])]
    near = []
    for t in work.rows("threads"):
        plans = []
        for p in t.get("plan") or []:
            try:
                ppt = work.point(p["at"], ch.vol)
            except (ValueError, KeyError):
                continue
            if ppt.vi == pt.vi and abs(ppt.ci - pt.ci) <= 1:
                plans.append({"at": work.label(ppt), "do": p.get("do"), "note": p.get("note")})
        if plans:
            done = [{"at": work.label(x["at"]), "kind": x["kind"]} for x in s.threads.get(t.get("id"), [])]
            near.append({"id": t.get("id"), "desc": t.get("desc"), "done": done, "plan": plans})
    questions = [q for q in work.rows("questions") if q.get("status", "open") == "open" and _same_chapter(work, q.get("at"), ch)]
    data = {
        "at": label, "when": when(sc), "place": sc.get("place"), "summary": sc.get("summary"),
        "card": text, "notes": notes_section(work, ch, pt.scene),
        "cast": [person_state(work, s, n) for n in cast],
        "place_info": {k: place.get(k) for k in ("name", "where", "looks", "notes") if place.get(k)} if place else None,
        "routes": [{k: r.get(k) for k in ("from", "to", "via", "time")} for r in routes],
        "documents": [{"id": d.get("id"), "title": d.get("title"), "text": d.get("text")} for d in docs],
        "threads": near, "questions": [{"id": q.get("id"), "q": q.get("q")} for q in questions],
    }
    out = [f"# {label} {data['when']} {data['place'] or ''}".rstrip() + (f"｜{data['summary']}" if data["summary"] else "")]
    if not sc:
        out.append("（場面の表に無い）")
    if text:
        out += ["", "## カード", *text]
    if data["notes"]:
        out += ["", "## 筋道メモ", *data["notes"]]
    if cast:
        out += ["", "## 人物（場面の頭）"]
        for d in data["cast"]:
            out += person_lines(d)
    if place or routes:
        out += ["", "## 場所"]
        if place:
            out.append(f"- {place['name']}: " + "／".join(place.get(k) for k in ("where", "looks") if place.get(k)))
            out += [f"  - {n}" for n in place.get("notes") or []]
        out += [f"- 道のり {r['from']}→{r['to']}: " + "／".join(x for x in (r.get("via"), r.get("time")) if x) for r in routes]
    if docs:
        out += ["", "## 文書の正本"]
        for d in data["documents"]:
            out += [f"- {d['title']}（{d['id']}）", *[f"  {x}" for x in (d["text"] or "（文面なし）").rstrip().split("\n")]]
    if near:
        out += ["", "## 近くの伏線"]
        for t in near:
            done = "、".join(f"{ja(x['kind'])} {x['at']}" for x in t["done"])
            plan = "、".join(f"{ja(p['do'])} {p['at']}" + (f"（{p['note']}）" if p["note"] else "") for p in t["plan"])
            out.append(f"- {t['id']}: {t['desc']}｜済: {done or 'なし'}｜予定: {plan}")
    if questions:
        out += ["", "## 作者に確認中", *[f"- {q['id']} {q['q']}" for q in data["questions"]]]
    return data, out


def brief_ahead(work: Work, text: str):
    """本文がまだない章の brief: plot のカードと筋道メモに、前の章の終わりの人物の状態を添える。"""
    m = POINT.match(str(text))
    vol = work._vol(m["vol"])
    # shortcut: 章のファイル名が指定の字そのもの（05 → 05.kym.txt）のときだけ引ける。名前つきの章が要るようになったら plot の見出しから探す
    ch = SimpleNamespace(vol=vol, id=m["ch"])
    scene = int(m["scene"] or 1)
    text_, notes = card(work, ch, scene), notes_section(work, ch, scene)
    if not text_ and not notes:
        raise NotWritten(f"章 {m['ch']} が {vol} の本文にも plot にも無い")
    vi = work.volumes.index(vol)
    prev = next((c for c in reversed(work.chapters) if c.vi <= vi), None)
    s = replay(work, work.end_of(prev), inclusive=True) if prev else replay(work, Point(-1, 0, 0))
    cast = list(dict.fromkeys(work.people.get(n, n) for sc in work.scenes if prev and (sc["_pt"].vi, sc["_pt"].ci) == (prev.vi, prev.ci)
                              for n in sc.get("cast") or []))
    label = f"{m['ch']}:{scene}" if len(work.volumes) == 1 else f"{vol}/{m['ch']}:{scene}"
    after = work.label(work.end_of(prev)) if prev else "はじめ"
    data = {"at": label, "unwritten": True, "after": after, "card": text_, "notes": notes,
            "cast": [person_state(work, s, n) for n in cast]}
    out = [f"# {label}（本文まだ。人物は {after} の終わりの状態）"]
    if text_:
        out += ["", "## カード", *text_]
    if notes:
        out += ["", "## 筋道メモ", *notes]
    if cast:
        out += ["", f"## 人物（{after} の終わり）"]
        for d in data["cast"]:
            out += person_lines(d)
    return data, out


def _cited_in(work: Work, anchor: str, pt: Point) -> bool:
    try:
        hit = work.resolve(anchor, work.ch_of(pt).vol)
    except ValueError:
        return False
    return (hit.ch.vi, hit.ch.ci, hit.scene) == (pt.vi, pt.ci, pt.scene)


def _same_chapter(work: Work, at, ch) -> bool:
    try:
        p = work.point(at, ch.vol) if at else None
    except ValueError:
        return False
    return p is not None and (p.vi, p.ci) == (ch.vi, ch.ci)


def search(work: Work, word: str, at: Point | None = None):
    pw = plain(word)
    text_hits = []
    for ch in work.chapters:
        for i, raw, pl in ch.body_lines():
            if at and Point(ch.vi, ch.ci, ch.scene_of(i)) >= at:
                continue
            if word in raw or (pw and pw in pl):
                text_hits.append({"where": f"{ch.rel}:{i}", "scene": f"{ch.id}:{ch.scene_of(i)}", "text": raw.strip()})
    ledger_hits = []
    for path in sorted(work.ledger_dir.glob("*.yaml")):
        rel = path.relative_to(work.root).as_posix()
        for i, x in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
            if word in x:
                ledger_hits.append({"where": f"{rel}:{i}", "text": x.strip()})
    for name in ("scenes", "events"):
        for row in getattr(work, name):
            if (at is None or row["_pt"] < at) and word in str({k: v for k, v in row.items() if not k.startswith("_")}):
                ledger_hits.append({"where": f"{work.ledger_file(name, row['_vol'])} {work.label(row['_pt'])}",
                                    "text": fmt_event(work, row) if name == "events" else row.get("summary") or ""})
    md = markdown_hits(work, word)
    data = {"word": word, "manuscript": text_hits, "ledger": ledger_hits, "markdown": md}
    out = []
    for title, rows, fmt in (
        ("本文", text_hits, lambda h: f"{h['where']}（{h['scene']}）{h['text']}"),
        ("台帳", ledger_hits, lambda h: f"{h['where']} {h['text']}"),
        ("設定集・plot", md, lambda h: f"{h['where']} [{h['heading']}]{''.join(h['labels'])} {h['text']}"),
    ):
        out.append(f"## {title} {len(rows)} 件")
        out += [fmt(h) for h in rows[:LIMIT]]
        if len(rows) > LIMIT:
            out.append(f"（ほか {len(rows) - LIMIT} 件。--json で全部）")
    return data, out


def last_point(work: Work) -> Point | None:
    return work.end_of(work.chapters[-1]) if work.chapters else None


def state_of(work: Work, who: str, at: Point | None):
    key = work.people.get(who)
    if key is None:
        raise ValueError(f"人物 {who} が characters.yaml に無い")
    s = replay(work, at) if at else replay(work)
    d = person_state(work, s, key)
    d["at"] = work.label(at) + " の頭" if at else "最後まで"
    return d, [f"# {key}（{d['at']}）", *person_lines(d)]


def knows(work: Work, secret: str, at: Point | None):
    sec = next((x for x in work.rows("secrets") if x.get("id") == secret), None) or \
        next((x for x in work.rows("secrets") if secret in (x.get("fact") or "")), None)
    if sec is None:
        raise ValueError(f"秘密 {secret} が secrets.yaml に無い")
    s = replay(work, at) if at else replay(work)
    who = [{"name": p, "at": work.label(k["at"]) if k["at"] else "はじめから", "src": k["src"]}
           for p, ks in s.knows.items() for k in ks if k["what"] == sec["id"]]
    knowers = {w["name"] for w in who}
    not_yet = [c.get("short") or c["name"] for c in work.characters if (c.get("short") or c["name"]) not in knowers]
    data = {"id": sec["id"], "fact": sec.get("fact"), "reader": sec.get("reader"), "reader_note": sec.get("reader_note"), "knows": who, "not_yet": not_yet,
            "at": work.label(at) if at else None}
    out = [f"# {sec['id']}: {sec.get('fact')}（読者: {reader_text(sec) or '不明'}）"]
    out += [f"- 知っている: {w['name']}（{w['at']}）" for w in who]
    out.append("- まだ知らない: " + ("、".join(not_yet) or "なし"))
    return data, out


def where(work: Work, item: str, at: Point | None):
    name = work.item_names.get(item)
    if name is None:
        raise ValueError(f"持ち物 {item} が items.yaml に無い")
    s = replay(work, at) if at else replay(work)
    first = next((i.get("holder") for i in work.items if i["name"] == name), None)
    hist = [{"at": work.label(m["at"]), "to": m["to"]} for m in s.moves.get(name, [])]
    data = {"item": name, "holder": s.holder.get(name), "first": first, "moves": hist}
    out = [f"# {name}: いま {data['holder'] or '不明'}" + (f"（{work.label(at)} の頭）" if at else ""),
           f"- はじめ: {first or '不明'}", *[f"- {m['at']} → {m['to']}" for m in hist]]
    return data, out


def _scene_events(work: Work, pt: Point) -> list[dict]:
    return [e for e in work.events if e["_pt"] == pt]


def timeline(work: Work):
    """作中の日時順（日が無い場面は本文の順のまま、先頭に置く）。"""
    rows = sorted(work.scenes, key=lambda s: (s.get("day") is not None, s.get("day") or 0, minutes(s.get("time")) or 0, s["_pt"]))
    data, out = [], []
    for sc in rows:
        evs = _scene_events(work, sc["_pt"])
        data.append({"at": work.label(sc["_pt"]), "when": when(sc), "place": sc.get("place"), "cast": sc.get("cast"),
                     "summary": sc.get("summary"), "events": [ev_data(work, e) for e in evs]})
        out.append(f"{work.label(sc['_pt'])} {when(sc) or '日時なし'} {sc.get('place') or ''} [{'・'.join(sc.get('cast') or [])}] {sc.get('summary') or ''}")
        out += [f"    {fmt_event(work, e)}" for e in evs]
    return data, out


def recap(work: Work, until: Point):
    """本文の順に、章ごとのあらすじと出来事。until の章の終わりまで。"""
    end = work.end_of(work.ch_of(until)) if not until.scene else until
    data, out = [], []
    for ch in work.chapters:
        if Point(ch.vi, ch.ci, 1) > end:
            break
        out.append(f"## {ch.id if len(work.volumes) == 1 else ch.vol + '/' + ch.id}")
        for n in range(1, ch.scenes + 1):
            pt = Point(ch.vi, ch.ci, n)
            if pt > end:
                break
            sc = scene_row(work, pt) or {}
            evs = _scene_events(work, pt)
            data.append({"at": work.label(pt), "when": when(sc), "summary": sc.get("summary"), "events": [ev_data(work, e) for e in evs]})
            out.append(f"- {work.label(pt)} {when(sc)} {sc.get('summary') or '（場面の表に無い）'}")
            out += [f"    {fmt_event(work, e)}" for e in evs]
    return data, out


def src_hit(work: Work, src: str | None, vol: str) -> dict:
    """出来事の引用と、引き直した本文の行。迷子なら lost に理由。"""
    if not src:
        return {}
    try:
        h = work.resolve(src, vol)
    except ValueError as e:
        return {"src": src, "lost": str(e)}
    return {"src": src, "where": h.where, "line": h.line}


def threads(work: Work, at: Point | None):
    """伏線ごとの、置いた・匂わせた・回収した所と予定。回収の予定を過ぎて回収していないものに印を付ける。"""
    now = at or last_point(work)
    if now is None:
        return {"at": None, "threads": []}, ["# 伏線", "（場面の表が無い）"]
    s = replay(work, at) if at else replay(work, now, inclusive=True)
    data, out = [], []
    for t in work.rows("threads"):
        done = [{"at": work.label(x["at"]), "kind": x["kind"], **src_hit(work, x["src"], x["vol"])} for x in s.threads.get(t.get("id"), [])]
        plan, late = [], False
        for p in t.get("plan") or []:
            plan.append({"at": p.get("at"), "do": p.get("do"), "note": p.get("note")})
            try:
                ppt = work.point(p["at"])
            except (ValueError, KeyError):
                continue  # まだ無い巻・章への予定
            if p.get("do") == "payoff" and ppt <= now and not any(d["kind"] == "payoff" for d in done):
                late = True
        base = "paid_off" if any(d["kind"] == "payoff" for d in done) else ("planted" if done else "not_planted")
        status = "overdue" if late else base
        data.append({"id": t.get("id"), "desc": t.get("desc"), "status": status, "done": done, "plan": plan})
        out += [f"## {t.get('id')}（{ja(base)}{'・' + ja('overdue') if late else ''}）", f"- {t.get('desc') or ''}"]
        out += [f"- {ja(d['kind'])} {d['at']}" + (f" {d['where']}" if d.get("where") else f"（{d['lost']}）" if d.get("lost") else "") for d in done]
        out += [f"- 予定: {ja(p['do'])} {p['at']}" + (f"（{p['note']}）" if p.get("note") else "") for p in plan]
        out.append("")
    head = f"# 伏線（{work.label(now)} の時点）"
    return {"at": work.label(now), "threads": data}, [head, "", *out] if out else [head, "（伏線が無い）"]


# --json にだけ足す台帳の項目（出す鍵 -> 台帳の項目。無ければ省く）。用語の note は一言の note（読み）とぶつかるので desc で出す
LIST_MORE = {"characters": {"short": "short", "aliases": "aliases"}, "terms": {"reading": "reading", "desc": "note"}}
LIST_KINDS = {  # 種類 -> (名前の項目, 一言の項目)
    "characters": ("name", "role"), "terms": ("term", "reading"), "places": ("name", "where"),
    "items": ("name", "holder"), "secrets": ("id", "fact"), "threads": ("id", "desc"), "documents": ("id", "title"),
}


def listing(work: Work, kind: str):
    """台帳の名前を一行ずつ並べる（中身は state・knows・where・search・render の生成物で引く）。"""
    if kind not in LIST_KINDS:
        raise ValueError(f"種類は {', '.join(LIST_KINDS)} のどれか: {kind}")
    key, note = LIST_KINDS[kind]
    rows = {"characters": work.characters, "places": work.places_list, "items": work.items}.get(kind) or work.rows(kind)
    data = [{"name": r.get(key), "note": r.get(note), **{k: r[f] for k, f in LIST_MORE.get(kind, {}).items() if r.get(f) is not None}}
            for r in rows if r.get(key)]
    return data, [f"- {d['name']}" + (f" — {d['note']}" if d["note"] else "") for d in data]
