#!/usr/bin/env python3
"""shosai の指摘ファイル（<作品>/review/<巻>.json）に、エージェントの指摘を一件足す。

添削モード（roles.toml の [mode] write = "human"）で、見る役が本文を書き換えずに直しの案を渡すときに使う。
足した指摘は status: open で残り、作者が shosai で一つずつ採るか決める（「適用」で本文に入る）。

  review_add.py <作品のフォルダ> <巻>/<章のファイル> --quote 文字列 --after 直した文字列 [--body 理由]
  review_add.py <作品のフォルダ> <巻>/<章のファイル> --quote 文字列 --kind suggest|comment --body 中身

--quote は本文の字のまま（ルビの記法も含む）。同じ字が何度も出るときは --nth で何番目か（0 から）を選ぶ。
書式は harness/rules/shosai-review.md と shosai の src/types.ts の Entry に合わせる。
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

CTX = 12  # shosaiのsrc/kym.tsと同じ長さの前後の字


def locate(lines: list[str], quote: str, nth: int) -> tuple[int, str, str]:
    """quote の nth 番目の出どころ（1 始まりの行番号、前の字、後ろの字）"""
    n = 0
    for i, line in enumerate(lines):
        s = line.find(quote)
        while s >= 0:
            if n == nth:
                e = s + len(quote)
                return i + 1, line[max(0, s - CTX):s], line[e:e + CTX]
            n += 1
            s = line.find(quote, s + 1)
    raise SystemExit(f"not found in the manuscript: {quote}")


def add(work: Path, file: str, quote: str, kind: str, after: str | None, body: str, nth: int = 0) -> dict:
    vol = file.split("/")[0]
    lines = (work / "manuscript" / file).read_text(encoding="utf-8").split("\n")
    line, prefix, suffix = locate(lines, quote, nth)
    path = work / "review" / f"{vol}.json"
    review = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"work": work.name, "vol": vol, "entries": []}
    num = max([int(e["id"][2:]) for e in review["entries"] if e["id"][2:].isdigit()] + [0]) + 1
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    entry = {"id": f"R-{num:04d}", "kind": kind, "status": "open", "file": file, "line": line,
             "quote": quote, "prefix": prefix, "suffix": suffix, "body": body, "reply": None, "created": now, "updated": now}
    if after is not None:
        entry |= {"before": quote, "after": after}
    review["entries"].append(entry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return entry


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("work", type=Path)
    ap.add_argument("file", help="path under manuscript/ (e.g. vol1/01.kym.txt)")
    ap.add_argument("--quote", required=True)
    ap.add_argument("--after", help="the fixed text; makes a replace entry like the author's edits")
    ap.add_argument("--kind", choices=["replace", "suggest", "comment"])
    ap.add_argument("--body", default="")
    ap.add_argument("--nth", type=int, default=0)
    a = ap.parse_args()
    kind = a.kind or ("replace" if a.after is not None else "suggest")
    if kind == "replace" and a.after is None:
        ap.error("replace needs --after")
    if kind != "replace" and not a.body:
        ap.error(f"{kind} needs --body")
    e = add(a.work, a.file, a.quote, kind, a.after if kind == "replace" else None, a.body, a.nth)
    print(e["id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
