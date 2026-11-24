from syuki.style import contrast

LINES = ["---", "title: x", "---", "", "　走った、そして歯車が止まった。", "", "　", "", "「止まれ」と言った。"]
ENTRIES = [
    {"id": "R-1", "kind": "replace", "status": "done", "file": "a", "line": 5, "prefix": "　走った、", "before": "歯車が", "after": "そして歯車が", "suffix": "止まっ"},
    {"id": "R-2", "kind": "delete", "status": "applied", "file": "a", "line": 7, "prefix": "　", "before": "輪が砕けた。", "after": "", "suffix": ""},
    {"id": "R-3", "kind": "insert", "status": "done", "file": "a", "line": 5, "prefix": "　", "before": "", "after": "消えた語", "suffix": ""},
    {"id": "R-4", "kind": "replace", "status": "done", "file": "a", "line": 9, "prefix": "「", "before": "待て", "after": "止まれ", "suffix": "」"},
    {"id": "R-5", "kind": "ruby", "status": "done", "file": "a", "line": 5, "prefix": "", "before": "歯車", "after": "｜歯車《はぐるま》", "suffix": ""},
    {"id": "R-6", "kind": "replace", "status": "open", "file": "a", "line": 5, "prefix": "", "before": "x", "after": "y", "suffix": ""},
]


def test_contrast_pairs_and_merge():
    got, skipped = contrast.pairs("vol1", ENTRIES, lambda f: LINES)
    assert [(p["key"], p["after"], p["before"]) for p in got] == [
        ("vol1 R-1", "　走った、そして歯車が止まった。", "　走った、歯車が止まった。"),
        ("vol1 R-2", "", "　輪が砕けた。"),
    ]
    assert skipped == ["vol1 R-3: not found in the current manuscript", "vol1 R-4: not narration"]
    got[0]["before_voice"], got[0]["after_voice"] = {"sentences": 1, "voiced": 1}, {"sentences": 1, "voiced": 0}
    got[1]["before_voice"], got[1]["after_voice"] = {"sentences": 1, "voiced": 0}, {"sentences": 0, "voiced": 0}
    text, added = contrast.merge("# 温度の対\n", got)
    assert [p["key"] for p in added] == ["vol1 R-1", "vol1 R-2"]
    assert text.index("## vol1 R-2（a、声なし 1→0）") < text.index("## vol1 R-1（a、声なし 0→1）")  # 声なしが減った順
    assert "（段落ごと削った）" in text and text.count(contrast.MARK) == 1
    again, added = contrast.merge(text, got)
    assert again == text and added == []


from syuki.style import excess


def test_excess_scores_overused_grams_and_weights_nouns():
    target_runs = [[("言う", False), ("た", False)]] * 6 + [[("剣", True), ("剣", True)]] * 6 + [[("歩く", False), ("た", False)]] * 20
    base_runs = [[("言う", False), ("た", False)]] * 1 + [[("剣", True), ("剣", True)]] * 1 + [[("歩く", False), ("た", False)]] * 40
    t, nouns = excess.grams(target_runs)
    b, _ = excess.grams(base_runs)
    assert ("剣", "剣") in nouns and ("言う", "た") not in nouns
    rows = excess.score(t, b, nouns, alpha=10)
    grams = [r["gram"] for r in rows]
    assert "言うた" in grams and "言う" not in grams  # 数が同じ短い並びは長いほうに任せる
    assert grams.index("言うた") < grams.index("剣剣")  # 名詞だけの並びは重みが下がる
    assert all(r["gram"] != "歩くた" for r in rows)  # 基準より少ないものは出ない


def test_excess_tokens_cut_at_names():
    try:
        tok = excess.tokenizer()
    except ImportError:
        return
    runs = excess.tokens(["ハルが言った。"], ["ハル"], tok)
    assert [w for run in runs for w, _ in run] == ["が", "言う", "た"]


from collections import Counter

from syuki.style import endings


def test_endings_compare_with_samples():
    rows = [{"speaker": "ハル", "endings": ["わよ", "なさい"]}, {"speaker": "ハル", "endings": ["だろ"]},
            {"speaker": "ソラ", "endings": ["です"]}, {"speaker": None, "endings": ["ね"]}]
    spoken = endings.tally(rows)
    assert spoken == {"ハル": Counter({"わよ": 1, "なさい": 1, "だろ": 1}), "ソラ": Counter({"です": 1})}
    got = endings.compare(spoken, {"ハル": Counter({"わよ": 2, "なさい": 1, "わ": 1})})
    assert got[0]["speaker"] == "ハル" and got[0]["off_sample"] == 0.33 and got[0]["off_top"] == [["だろ", 1]]
    assert got[0]["sample_unused"] == ["わ"]
    assert got[1]["speaker"] == "ソラ" and got[1]["off_sample"] is None  # 見本の無い人物は割合を出さない


from syuki.style import heat


def test_heat_summary_groups_runs_and_drops():
    run = {"start": 3, "sentences": 12}
    pars = [{"line": 3, "run": run, "drop": False}, {"line": 5, "run": run, "drop": True}, {"line": 9, "run": None, "drop": True}]
    assert heat.summary(pars) == {"runs": [{"start": 3, "sentences": 12, "lines": [3, 5]}], "drops": [5, 9]}
    assert heat.lines("vol1/01.kym.txt", pars)[1:] == ["- [声なし] lines 3-5 (12 sentences)", "- [落とし] line 5", "- [落とし] line 9"]
