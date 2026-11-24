#!/usr/bin/env python3
"""作品フォルダに plot.md、characters.md、style/profile.toml、style/keep.md の雛形を置く。

使い方: python3 init_work.py [作品フォルダ]   （省略時は作業ディレクトリ）
雛形は assets/ から複製する。既にあるファイルは上書きしない。
"""
import pathlib
import shutil
import sys

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
# (雛形, 置き場所)
NAMES = [("plot.md", "plot.md"), ("characters.md", "characters.md"), ("profile.toml", "style/profile.toml"), ("keep.md", "style/keep.md")]


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    work = pathlib.Path(argv[1]) if len(argv) > 1 else pathlib.Path.cwd()
    work.mkdir(parents=True, exist_ok=True)
    for name, place in NAMES:
        target = work / place
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            print(f"既存: {target}")
            continue
        shutil.copyfile(ASSETS / name, target)
        print(f"作成: {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
