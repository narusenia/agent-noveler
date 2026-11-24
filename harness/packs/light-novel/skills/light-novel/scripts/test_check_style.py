#!/usr/bin/env python3
"""check_style.py の小さな自己確認。使い方: python3 test_check_style.py（SudachiPy は要らない）"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_style as cs  # noqa: E402

SETUP = "　朝の食堂はまだ薄暗くて、竈の火だけが赤く、鍋の湯気が窓の桟まで上がっていた。"
text = "\n\n".join([
    SETUP, "　二人ぶん。いつもどおりだ。",  # 前振りのあとの短い段落
    "「行くぞ」", "　俺も、歩いた。",  # 台詞のあとでも、読点のあとの一語は数える
    "　出てきたのは、錆びた鍵だった。",  # 分裂文
    SETUP, "　座っただけだぞ。",  # ツッコミは数えない
    SETUP, "　覚えてたのか、それ。",  # 倒置は数えない
])
got = [n for n, _ in cs.drops(cs.rows_of(text))]
assert got == [3, 7, 9], got

# 声なし: 声ありの判定は形態素の列で見る（表層形, 品詞, 中分類, 正規化形）
def toks(*pairs):
    return [(w, p, q, w) for w, p, q in pairs] + [("。", "補助記号", "句点", "。")]


assert cs.voiced("そうなるよな。", toks(("そう", "副詞", "*"), ("なる", "動詞", "一般"), ("よ", "助詞", "終助詞"), ("な", "助詞", "終助詞")))
assert cs.voiced("知らないけど。", toks(("知ら", "動詞", "一般"), ("ない", "助動詞", "*"), ("けど", "助詞", "接続助詞")))
assert cs.voiced("見てる。", toks(("見", "動詞", "一般"), ("てる", "助動詞", "*")))
assert not cs.voiced("返事はなかった。", toks(("返事", "名詞", "普通名詞"), ("は", "助詞", "係助詞"), ("なかっ", "形容詞", "非自立可能"), ("た", "助動詞", "*")))

# 区間: 声なし10文の途中に声ありが一文だけ挟まっても切らない。二文続いたら切る
cs.tokenize = lambda s: []
cs.voiced = lambda s, t: "よな" in s
quiet = "　" + "廊下を歩いた。" * 5 + "まあそうだよな。" + "廊下を歩いた。" * 5
prof = cs.Profile(voice_run=10, voice_min=0.0)
got = [f for f in cs.check(quiet, prof) if f.kind == "声なし"]
assert len(got) == 1 and "11文" in got[0].message and got[0].judgment, got
broken = "　" + "廊下を歩いた。" * 5 + "まあそうだよな。" * 2 + "廊下を歩いた。" * 5
assert not [f for f in cs.check(broken, prof) if f.kind == "声なし"]
# 段落ごとの声: 会話行は閉じ括弧の後ろだけ数える
got = cs.paragraphs("　廊下を歩いた。まあそうだよな。\n\n「行くぞ」と言った。\n\n「行くぞ」")
assert got == [{"line": 1, "kind": "narration", "sentences": 2, "voiced": 1, "run": None, "drop": False},
               {"line": 3, "kind": "dialogue", "sentences": 1, "voiced": 0, "run": None, "drop": False}], got
# 段落ごとの区間と落とし: 区間はcheck() の「声なし」と同じ所。台詞で区間が切れる
heat = "\n\n".join(["　" + "廊下を歩いた。" * 6, "　" + "廊下を歩いた。" * 5, "「行くぞ」", "　" + "廊下を歩いた。" * 3, SETUP, "　二人ぶん。いつもどおりだ。"])
got = cs.paragraphs(heat, prof)
assert [p["run"] for p in got] == [{"start": 1, "sentences": 11}] * 2 + [None] * 3, got
assert [p["line"] for p in got if p["drop"]] == [11], got
assert [f.line for f in cs.check(heat, prof) if f.kind == "声なし"] == [1]
# 波: 厚い段落（100字以上の地の文）がないまま2000字を超えると平ら。短い場面は＊のある章だけ
thin = "\n\n".join(["　" + "あ" * 40 + "。"] * 60)
assert [f.kind for f in cs.check(thin, prof) if f.kind == "平ら"] == ["平ら"]
anchored = "\n\n".join((["　" + "あ" * 40 + "。"] * 30 + ["　" + "い" * 120 + "。"]) * 2)
assert not [f for f in cs.check(anchored, prof) if f.kind == "平ら"]
flats, short = cs.waves(cs.rows_of("　短い。\n\n　　　＊\n\n" + "　" + "う" * 900 + "。"))
assert flats == [] and short == [(1, 3)], (flats, short)
assert cs.waves(cs.rows_of("　短い。"))[1] == []
print("ok")
