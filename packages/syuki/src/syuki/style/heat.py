"""段落ごとの声なし区間と落とし（check_style --paragraphs の答え）を、読む形にまとめる。判定は check_style が持つ。"""
from __future__ import annotations


def summary(pars: list[dict]) -> dict:
    """声なし区間（始まりの行・文の数・段落の行）と、落としの段落の行。"""
    runs: dict[int, dict] = {}
    for p in pars:
        if p.get("run"):
            r = runs.setdefault(p["run"]["start"], {**p["run"], "lines": []})
            r["lines"].append(p["line"])
    return {"runs": list(runs.values()), "drops": [p["line"] for p in pars if p.get("drop")]}


def lines(file: str, pars: list[dict]) -> list[str]:
    s = summary(pars)
    out = [f"## {file}（声なし区間 {len(s['runs'])}・落とし {len(s['drops'])}。判断の材料）"]
    out += [f"- [声なし] {r['start']}〜{r['lines'][-1]}行目（{r['sentences']}文）" for r in s["runs"]]
    out += [f"- [落とし] {n}行目" for n in s["drops"]]
    return out
