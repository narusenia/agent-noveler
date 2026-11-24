"""作者の赤（shosai の review/<巻>.json）から、地の文の温度の対（直した後／前）を作る。"""
import re

KINDS = {"replace", "insert", "delete"}  # ルビ・傍点は記法の直しなので外す
STATUSES = {"applied", "done"}
MARK = "# 【候補】作者の赤から"
INTRO = ("`syuki style contrast` が足した組です。声なしの文が減った順に並べています。良いが今の本文、悪いが赤の前です。"
         "作者が残す組を選んだら、残さない組を消してください。")


def locate(lines: list[str], e: dict) -> int | None:
    """今の本文で、赤が入った段落の行（0 始まり）。e["line"] に近い順に探す。"""
    needle = e.get("prefix", "") + e.get("after", "") + e.get("suffix", "")
    exact = not needle.strip("　 ")  # 段落ごと消した赤は、残った行と一字一字合わせる
    near = sorted(range(len(lines)), key=lambda i: abs(i + 1 - e.get("line", 0)))
    return next((i for i in near if (lines[i] == needle if exact else needle in lines[i])), None)


def narration(par: str) -> bool:
    return bool(par.strip("　 ")) and par.lstrip("　 ")[0] not in "「『（"


def pairs(vol: str, entries: list[dict], read) -> tuple[list[dict], list[str]]:
    """赤ごとの (後の段落, 前の段落)。read(file) は manuscript/ からのパスの行の列を返す。迷子・会話は理由つきで外す。"""
    out, skipped = [], []
    for e in entries:
        if e.get("kind") not in KINDS or e.get("status") not in STATUSES or "before" not in e:
            continue
        key = f"{vol} {e['id']}"
        lines = read(e["file"])
        i = locate(lines, e) if lines is not None else None
        if i is None:
            skipped.append(f"{key}: not found in the current manuscript")
            continue
        after = lines[i]
        old = e.get("prefix", "") + e["before"] + e.get("suffix", "")
        new = e.get("prefix", "") + e["after"] + e.get("suffix", "")
        before = old if not new.strip("　 ") else after.replace(new, old, 1)
        if not narration(before) or (after.strip("　 ") and not narration(after)):
            skipped.append(f"{key}: not narration")
            continue
        out.append({"key": key, "file": e["file"], "after": after.strip("　 ") and after, "before": before})
    return out, skipped


def voiceless(p: dict) -> int:
    return p["sentences"] - p["voiced"]


def section(pairs_: list[dict]) -> list[str]:
    """pairs_ は before_voice・after_voice（check_style --paragraphs の段落）を持つ。声なしが減った順に並べる。"""
    def drop(p):
        return voiceless(p["before_voice"]) - (voiceless(p["after_voice"]) if p["after"] else 0)
    out = []
    for p in sorted(pairs_, key=drop, reverse=True):
        b = voiceless(p["before_voice"])
        a = voiceless(p["after_voice"]) if p["after"] else 0
        out += [f"## {p['key']}（{p['file']}、声なし {b}→{a}）", "", "良い:", p["after"] or "（段落ごと削った）",
                "", "悪い:", p["before"], ""]
    return out


def merge(text: str, pairs_: list[dict]) -> tuple[str, list[dict]]:
    """contrast.md に、まだ無い組だけを【候補】節に足す。足した組を返す。"""
    new = [p for p in pairs_ if not re.search(rf"^## {re.escape(p['key'])}（", text, re.M)]
    if not new:
        return text, []
    head = [] if MARK in text else [MARK, "", INTRO, ""]
    return text.rstrip("\n") + "\n\n" + "\n".join(head + section(new)).rstrip("\n") + "\n", new
