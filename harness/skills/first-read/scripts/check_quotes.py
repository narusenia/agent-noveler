#!/usr/bin/env python3
"""初見読者の報告の「」『』の引用を本文と突き合わせ、本文に無い引用に印をつける。

使い方: python3 check_quotes.py 報告.md 本文... （本文は bundle.py の book.txt か章ファイル）
結果を Markdown で標準出力に出す。本文に見つからない引用があれば終了コード 1。
ルビ（｜漢字《よみ》、漢字《よみ》）、傍点（《《語》》）、縦中横（{!?}）、空白、全角半角の違いは外して比べる。
引用の中の「……」「（中略）」は省略とみなし、前後の切れ端がそれぞれ本文にあれば一致とする。
"""
import difflib
import re
import sys
import unicodedata
from pathlib import Path

MIN_LEN = 10  # これより短い「」は語の言及か読み手の言い換えが多いので数えない
NEAR = 0.6  # 本文との最長の共通部分が引用のこの割合以上なら「言い換え」
EMPHASIS = re.compile(r"《《([^》]*)》》")
RUBY = re.compile(r"[｜|]?([^｜|《》\s]+?)《[^》]*》")
TCY = re.compile(r"\{([^{}\n]{1,3})\}")
DROP = re.compile(r"[\s「」『』（）()*_]")
ELLIPSIS = re.compile(r"[…‥]+|\.{3,}|中略")  # 括弧はnormalize で外れるので「（中略）」もここで切れる
PAIRS = {"「": "」", "『": "』"}


def normalize(text):
    text = EMPHASIS.sub(r"\1", text)
    text = RUBY.sub(r"\1", text)
    text = TCY.sub(r"\1", text)
    return DROP.sub("", unicodedata.normalize("NFKC", text))


def quotes(text):
    """いちばん外側の「」『』の中身を (行番号, 中身) で返す。入れ子は外側ごと拾う。"""
    found, stack, start = [], [], None
    for lineno, line in enumerate(text.splitlines(), 1):
        for k, ch in enumerate(line):
            if ch in PAIRS:
                if not stack:
                    start = (lineno, line, k + 1)
                stack.append(PAIRS[ch])
            elif stack and ch == stack[-1]:
                stack.pop()
                if not stack and start[0] == lineno:
                    found.append((lineno, line[start[2]:k]))
        stack = []  # 行をまたぐ引用は拾わない（閉じ忘れを次の行へ持ちこまない）
    return found


def judge(quote, book):
    """'ok'・'near'・'missing' を返す。"""
    pieces = [p for p in ELLIPSIS.split(normalize(quote)) if len(p) >= 2]
    if all(p in book for p in pieces):
        return "ok"
    q = "".join(pieces)
    m = difflib.SequenceMatcher(None, book, q, autojunk=False).find_longest_match(0, len(book), 0, len(q))
    return "near" if m.size >= NEAR * len(q) else "missing"


def check(report, book):
    book = normalize(book)
    seen, results = set(), []
    for lineno, q in quotes(report):
        key = normalize(q)
        if len(key) < MIN_LEN or key in seen:
            continue
        seen.add(key)
        results.append((lineno, q, judge(q, book)))
    return results


def selftest():
    book = normalize("　｜港町《みなとまち》は霧に沈んだ。帳面には、《《白い船》》が来た、と書いてあったのに。\n「待て待て{!?}　お茶とか！」")
    assert judge("帳面には、白い船が来た、と書いてあったのに。", book) == "ok"
    assert judge("待て待て!?　お茶とか!", book) == "ok"
    assert judge("港町は霧に沈んだ。……と書いてあったのに", book) == "ok"
    assert judge("港町は霧に沈まなかった。帳面は燃えた", book) in ("near", "missing")
    assert judge("ドラゴンが空から降りてきて城を焼いた", book) == "missing"
    assert quotes("a「外『内』外」b「次」") == [(1, "外『内』外"), (1, "次")]


def main():
    if sys.argv[1:] == ["--selftest"]:
        selftest()
        print("ok")
        return 0
    if len(sys.argv) < 3:
        sys.exit("usage: check_quotes.py REPORT.md MANUSCRIPT...")
    report = Path(sys.argv[1]).read_text(encoding="utf-8")
    book = "\n".join(Path(p).read_text(encoding="utf-8") for p in sys.argv[2:])
    results = check(report, book)
    bad = [r for r in results if r[2] != "ok"]
    print("\n## 引用の照合（自動）\n")
    print(f"「」『』の引用 {len(results)} 件のうち、本文にそのまま無いものが {len(bad)} 件あります。"
          "「見つからない」は作り話の疑いがあります。根拠にする前に本文で確かめてください。\n")
    for lineno, q, verdict in sorted(bad, key=lambda r: (r[2] != "missing", r[0])):
        label = "見つからない" if verdict == "missing" else "言い換え（近い文はある）"
        short = q if len(q) <= 80 else q[:80] + "…"
        print(f"- [{label}] {lineno}行目「{short}」")
    return 1 if any(r[2] == "missing" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
