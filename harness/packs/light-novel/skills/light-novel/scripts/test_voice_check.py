#!/usr/bin/env python3
"""voice_check.py の小さな自己確認。使い方: python3 test_voice_check.py（SudachiPy は要らない）"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice_check as vc  # noqa: E402

vc.ending = lambda s: s.rstrip("。")[-2:]  # 語尾の切り出しはSudachi なしで代える
text = "「行くわよ。早くしなさい」とハルが言った。\n\n「うん」\n\n「来た」とソラ。"
got = vc.endings(text, ["ハル", "ソラ"])
assert got == [{"line": 1, "speaker": "ハル", "endings": ["わよ", "さい"]}, {"line": 5, "speaker": "ソラ", "endings": ["来た"]}], got  # 地の文に話者のない台詞は外す
got = vc.endings(text, ["ハル"], {3: "灯台守"})
assert [g["speaker"] for g in got] == ["ハル", "灯台守"], got
assert len(vc.endings(text)) == 3  # 名前なしは全部
print("ok")
