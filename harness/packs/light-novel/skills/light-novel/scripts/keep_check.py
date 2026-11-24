#!/usr/bin/env python3
"""作者が残すと決めた文が、直したあとも残っているかを確かめる。

使い方: python3 keep_check.py [--keep keep.md] [--baseline 元.txt] 本文.txt
  --keep      残す文の一覧。省略すると本文のフォルダから上へたどって style/keep.md を探す
  --baseline  直す前の本文。渡すと「元にあって、直したあとに消えた」文を出す。
              渡さないときは、その章を名指しした文が本文にあるかだけを見る
消えた文か見つからない文があれば終了コード 1。

keep.md の書き方（1行1件。ほかの行は読まない）:
  - vol1/04.txt: 見てもわからないから訊いたんだが。
  - 全章: それは、困る
章の指定は本文のパスの末尾と突き合わせる。照合ではルビ、傍点、空白を無視する。
"""
import argparse
import os
import re
import sys

ENTRY = re.compile(r"^\s*[-*]\s*(?P<scope>[^:：]+?)\s*[:：]\s*(?P<text>.+?)\s*$")
ALL_CHAPTERS = ("全章", "*", "all")
RUBY = re.compile(r"[｜|]([^｜|《》\n]+)《[^》\n]*》")
EMPHASIS = re.compile(r"《《([^》]*)》》")
TCY = re.compile(r"\{([^{}\n]{1,3})\}")


def plain(text):
    """ルビ・傍点・縦中横の記法と空白を外す。"""
    text = EMPHASIS.sub(r"\1", text)
    text = RUBY.sub(r"\1", text)
    text = TCY.sub(r"\1", text)
    return re.sub(r"\s+", "", text)


def find_keep(start):
    d = os.path.abspath(start)
    while True:
        path = os.path.join(d, "style", "keep.md")
        if os.path.isfile(path):
            return path
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def load(path):
    entries = []
    with open(path, encoding="utf-8") as f:
        for i, raw in enumerate(f, 1):
            m = ENTRY.match(raw)
            if m:
                text = m.group("text").strip()
                if len(text) >= 2 and text[0] in "「『" and text[-1] in "」』" and text.count(text[0]) == 1:
                    text = text[1:-1]
                entries.append({"line": i, "scope": m.group("scope").strip(), "text": text})
    return entries


def applies(entry, path):
    scope = entry["scope"]
    if scope in ALL_CHAPTERS:
        return True
    return os.path.normpath(path).replace(os.sep, "/").endswith(scope.replace(os.sep, "/"))


def check(entries, path, text, baseline=None):
    """消えた、または見つからない残す文を返す。"""
    after = plain(text)
    before = plain(baseline) if baseline is not None else None
    lost = []
    for e in entries:
        if not applies(e, path):
            continue
        needle = plain(e["text"])
        if not needle:
            continue
        if before is not None:
            n_before, n_after = before.count(needle), after.count(needle)
            if n_after < n_before:
                lost.append({**e, "reason": f"lost ({n_before}→{n_after})"})
        elif e["scope"] not in ALL_CHAPTERS and needle not in after:
            lost.append({**e, "reason": "not found"})
    return lost


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def main(argv):
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Check that kept lines are still in the manuscript")
    parser.add_argument("file", help="manuscript file")
    parser.add_argument("--keep", help="list of kept lines (default: style/keep.md found by searching up)")
    parser.add_argument("--baseline", metavar="BEFORE", help="the text before the fix")
    args = parser.parse_args(argv[1:])

    keep = args.keep or find_keep(os.path.dirname(os.path.abspath(args.file)))
    if not keep:
        print("keep.md not found; no kept lines are registered.")
        return 0
    lost = check(load(keep), args.file, read(args.file), read(args.baseline) if args.baseline else None)
    for e in lost:
        print(f"- [keep] {e['reason']}: {e['text']} (keep.md line {e['line']})")
    print(f"{len(lost)} kept line(s) to confirm" if lost else "All kept lines are present")
    return 1 if lost else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
