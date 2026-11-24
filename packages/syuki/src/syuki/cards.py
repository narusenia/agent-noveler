"""plot/<巻>.md の場面カードと、設定集の見出し・ラベルを読む。"""
from __future__ import annotations

import re

from .work import Chapter, Work

HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
ITEM = re.compile(r"^(\d+)\.\s")
LABEL = re.compile(r"【[^】]+】")


def chapter_cards(work: Work, ch: Chapter) -> dict | None:
    """章の節を {file, line, head, items{番号: 行}, notes} にする。見出しに `<章のファイル名>` を含む節を探す。"""
    rel = (work.conf.get("plots") or {}).get(ch.vol)
    if not rel or not (work.root / rel).is_file():
        return None
    lines = (work.root / rel).read_text(encoding="utf-8").split("\n")
    key = f"`{ch.id}{work.ext}`"
    start = next((i for i, x in enumerate(lines) if HEADING.match(x) and key in x), None)
    if start is None:
        return None
    level = len(HEADING.match(lines[start])[1])
    out = {"file": rel, "line": start + 1, "head": [], "items": {}, "notes": []}
    cur = None
    for x in lines[start + 1:]:
        h = HEADING.match(x)
        if h and len(h[1]) <= level:
            break
        if not x.strip():
            continue
        m = ITEM.match(x)
        if m:
            cur = int(m[1])
            out["items"][cur] = [x]
        elif cur is not None and x[:1].isspace():
            out["items"][cur].append(x)
        elif out["items"]:
            out["notes"].append(x)
            cur = None
        else:
            out["head"].append(x)
    return out


def card(work: Work, ch: Chapter, scene: int, number: int | None = None) -> list[str]:
    """場面のカード。番号の付いたカードが無い章（序章など）は節の頭を返す。"""
    c = chapter_cards(work, ch)
    if not c:
        return []
    if not c["items"]:
        return c["head"]
    return c["items"].get(number or scene, [])


def markdown_hits(work: Work, word: str) -> list[dict]:
    """設定集と plot から語を含む行を、見出しの道筋とラベル付きで返す。"""
    hits = []
    for rel in work.markdown_files():
        path: list[str] = []
        for i, x in enumerate((work.root / rel).read_text(encoding="utf-8").split("\n"), 1):
            h = HEADING.match(x)
            if h:
                path = path[: len(h[1]) - 1] + [""] * (len(h[1]) - 1 - len(path)) + [h[2].strip()]
            if word in x:
                labels = LABEL.findall(x) or [lab for p in path for lab in LABEL.findall(p)]
                hits.append({"where": f"{rel}:{i}", "heading": " > ".join(p for p in path if p),
                             "labels": labels, "text": x.strip()})
    return hits
