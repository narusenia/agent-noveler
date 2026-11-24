"""台帳から人が読む Markdown を作る（syuki render）。"""
from __future__ import annotations

from .state import replay
from .work import Work, ja, reader_text

NOTICE = "> 生成物。手で直さない（正本は `ledger/` の YAML。`syuki render` で作る）。"
DEFAULTS = {"characters": "characters.md", "details": "details.md", "map": "plot/map.md",
            "documents": "plot/documents.md", "state": "plot/{vol}-state.md"}


def cell(x) -> str:
    return str(x if x is not None else "").replace("|", "｜").replace("\n", " ") or "―"


def table(head: list[str], rows: list[list]) -> list[str]:
    return ["| " + " | ".join(head) + " |", "| " + " | ".join("---" for _ in head) + " |",
            *["| " + " | ".join(cell(c) for c in r) + " |" for r in rows]]


def where(work: Work, anchor: str) -> str:
    try:
        hit = work.resolve(anchor, work.volumes[0] if len(work.volumes) == 1 else None)
    except ValueError:
        return f"{anchor}（迷子）"
    return f"{hit.ch.rel}:{hit.line}"


def bullets(key: str, value, indent: str = "") -> list[str]:
    if isinstance(value, list):
        return [f"{indent}- {key}:", *[f"{indent}  - {v}" for v in value]]
    if isinstance(value, dict):
        return [f"{indent}- {key}:", *[f"{indent}  - {k}: {v}" for k, v in value.items()]]
    return [f"{indent}- {key}: {value}"]


def characters(work: Work) -> list[str]:
    out = ["# 登場人物", "", NOTICE]
    for c in work.characters:
        out += ["", f"## {c['name']}" + (f"（{c['role']}）" if c.get("role") else ""), ""]
        for k, v in (c.get("profile") or {}).items():
            out += bullets(k, v)
        if c.get("catchphrases"):
            out.append("- 口癖: " + "".join(f"「{x}」" for x in c["catchphrases"]))  # check_style が読む行
        if c.get("samples"):
            out += bullets("口調サンプル", c["samples"])
        if c.get("lines"):
            out += bullets("決め台詞", [f"{a}（{where(work, a)}）" for a in c["lines"]])
        if c.get("notes"):
            out += bullets("本文で足した事実", c["notes"])
    return out


def details(work: Work) -> list[str]:
    out = ["# 設定の追記・本文の決定事項", "", NOTICE]
    world = work.led["world"]
    n = 0
    for n, (title, notes) in enumerate((world.get("sections") or {}).items(), 1):
        out += ["", f"## {n}. {title}", "", *[f"- {x}" for x in notes or []]]
    if world.get("incidents"):
        n += 1
        out += ["", f"## {n}. 事件表", ""]
        out += table(["巻・章", "日", "出来事", "記録の上では"],
                     [[i.get("at"), i.get("day"), i.get("what"), i.get("record")] for i in world["incidents"]])
    terms = work.rows("terms")
    if terms:
        n += 1
        out += ["", f"## {n}. 用語の初出", ""]
        rows = []
        for t in terms:
            first = ""
            if t.get("explained"):
                try:
                    hit = work.resolve(t["explained"], work.volumes[0] if len(work.volumes) == 1 else None)
                    first = f"{hit.ch.vol} {hit.ch.id}:{hit.scene}"
                except ValueError:
                    first = "迷子"
            rows.append([t.get("term"), t.get("reading"), " ".join(x for x in (first, t.get("note") or "") if x)])
        out += table(["語", "読み", "初出"], rows)
    return out


def map_md(work: Work) -> list[str]:
    out = ["# 場所と道のり", "", NOTICE, "", "## 1. 場所", ""]
    out += table(["場所", "位置・方角", "様子", "根拠"],
                 [[p["name"] + (f"（{p['in']}）" if p.get("in") else ""), p.get("where"), p.get("looks"),
                   ", ".join(where(work, a) for a in p.get("src") or [])] for p in work.places_list])
    out += ["", "## 2. 道のりと時間", ""]
    out += table(["区間", "道順", "時間", "根拠"],
                 [[f"{r.get('from')} → {r.get('to')}", r.get("via"), r.get("time") or (f"{r['minutes']}分" if r.get("minutes") else None),
                   ", ".join(where(work, a) for a in r.get("src") or [])] for r in work.routes])
    detail = [p for p in work.places_list if p.get("notes")]
    if detail:
        out += ["", "## 3. 細部"]
        for p in detail:
            out += ["", f"### {p['name']}", "", *[f"- {x}" for x in p["notes"]]]
    return out


def documents(work: Work) -> list[str]:
    out = ["# 作中の文書の正本", "", NOTICE]
    for d in work.rows("documents"):
        out += ["", f"## {d.get('title')}（{d.get('id')}）", ""]
        if d.get("author"):
            out.append(f"- 書いた人: {d['author']}")
        if d.get("holder"):
            out.append(f"- いま: {d['holder']}")
        if d.get("cites"):
            out.append("- 出た所: " + ", ".join(where(work, a) for a in d["cites"]))
        out += [f"- {x}" for x in d.get("notes") or []]
        out += ["", "```text", (d.get("text") or "（文面なし）").rstrip(), "```"]
    return out


def state_md(work: Work, vol: str) -> list[str]:
    chs = [c for c in work.chapters if c.vol == vol]
    out = [f"# {vol}　人物の状態表", "", NOTICE, "", "## 1. 章末ごとの状態"]
    for ch in chs:
        end = work.end_of(ch)
        s = replay(work, end, inclusive=True)
        cast = []
        for sc in work.scenes:
            if (sc["_pt"].vi, sc["_pt"].ci) == (ch.vi, ch.ci):
                cast += [work.people.get(n, n) for n in sc.get("cast") or [] if work.people.get(n, n) not in cast]
        rows = []
        for who in cast:
            new = [k["what"] for k in s.knows.get(who, []) if k["at"] and (k["at"].vi, k["at"].ci) == (ch.vi, ch.ci)]
            feels = [f"{t}→{f['what']}" for t, f in s.feels.get(who, {}).items()]
            place = s.place.get(who, {}).get("place")
            rows.append([who, "、".join(new), "、".join(feels), "、".join(s.items_of(who)), place])
        out += ["", f"### {ch.id}（章末）", ""]
        out += table(["人物", "この章で知ったこと", "気持ち", "持ち物", "居場所"], rows) if rows else ["（場面の表に人物が無い）"]
    last = work.end_of(chs[-1]) if chs else None
    s = replay(work, last, inclusive=True) if last else replay(work)
    out += ["", "## 2. 秘密と知っている人", ""]
    rows = []
    for sec in work.rows("secrets"):
        who = [f"{p}（{work.label(k['at']) if k['at'] else 'はじめから'}）" for p, ks in s.knows.items() for k in ks if k["what"] == sec.get("id")]
        rows.append([sec.get("id"), sec.get("fact"), "、".join(who), reader_text(sec)])
    out += table(["秘密", "中身", "知っている人", "読者"], rows)
    out += ["", "## 3. 持ち物の移り変わり", ""]
    out += table(["物", "はじめ", "移り変わり"],
                 [[i["name"], i.get("holder"), " → ".join(f"{m['to']}（{work.label(m['at'])}）" for m in s.moves.get(i["name"], []))]
                  for i in work.items])
    out += ["", "## 4. 伏線の進み", ""]
    rows = []
    for t in work.rows("threads"):
        done = [f"{ja(x['kind'])} {work.label(x['at'])}" for x in s.threads.get(t.get("id"), [])]
        plan = [f"{ja(p.get('do'))} {p.get('at')}" for p in t.get("plan") or []]
        rows.append([t.get("id"), t.get("desc"), "、".join(done), "、".join(plan)])
    out += table(["伏線", "中身", "ここまで", "予定"], rows)
    return out


def render(work: Work) -> list[str]:
    paths = {**DEFAULTS, **(work.conf.get("render") or {})}
    jobs = [(paths["characters"], characters(work)), (paths["details"], details(work)),
            (paths["map"], map_md(work)), (paths["documents"], documents(work))]
    jobs += [(paths["state"].format(vol=v), state_md(work, v)) for v in work.volumes]
    written = []
    for rel, lines in jobs:
        path = work.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        written.append(rel)
    return written


def stages(work: Work, absent_after: int = 2):
    """人物ごとの、章末の好意の段階と登場。最後の absent_after 章に出ていなければ知らせる。"""
    conf = work.conf.get("stages") or {}
    chs = work.chapters
    data, rows = [], []
    for h, steps in conf.items():
        key = work.people.get(h, h)
        cols, last_seen = [], None
        for ch in chs:
            s = replay(work, work.end_of(ch), inclusive=True)
            seen = any(key in [work.people.get(n, n) for n in sc.get("cast") or []]
                       for sc in work.scenes if (sc["_pt"].vi, sc["_pt"].ci) == (ch.vi, ch.ci))
            last_seen = ch if seen else last_seen
            st = s.stage.get(key)
            cols.append({"chapter": ch.id, "stage": st["what"] if st else steps[0], "seen": seen})
        gap = len(chs) - 1 - chs.index(last_seen) if last_seen else len(chs)
        data.append({"heroine": key, "chapters": cols, "last_seen": last_seen.id if last_seen else None, "absent": gap >= absent_after})
        rows.append([key, *[c["stage"] + ("" if c["seen"] else "（不在）") for c in cols], last_seen.id if last_seen else "なし"])
    out = table(["人物", *[c.id for c in chs], "最後に出た章"], rows)
    away = [d["heroine"] for d in data if d["absent"]]
    if away:
        out.append(f"しばらく出ていない（{absent_after} 章以上）: " + "、".join(away))
    return data, out

