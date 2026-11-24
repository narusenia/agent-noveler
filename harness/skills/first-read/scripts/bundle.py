#!/usr/bin/env python3
"""章の本文だけを一つのファイルに束ねる。設定資料を読ませないため、作品のフォルダの外に置く。

使い方: python3 bundle.py OUT_DIR 章ファイル...
OUT_DIR/book.txt を書き、そのパスを出す。
"""
import re
import sys
from pathlib import Path


def body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    # フロントマター（--- で囲んだ頭）は作者名などを含むので外す
    return re.sub(r"\A---\n.*?\n---\n", "", text, count=1, flags=re.S).strip()


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit("usage: bundle.py OUT_DIR CHAPTER_FILE...")
    out = Path(sys.argv[1])
    files = sorted(Path(p) for p in sys.argv[2:])
    for f in files:
        if not f.name.endswith(".kym.txt"):
            sys.exit(f"only manuscript files (.kym.txt) can be bundled: {f}")
    out.mkdir(parents=True, exist_ok=True)
    book = out / "book.txt"
    book.write_text("\n\n――――――――\n\n".join(body(f) for f in files) + "\n", encoding="utf-8")
    print(book)


if __name__ == "__main__":
    main()
