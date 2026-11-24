from conftest import load


def test_render_writes_generated_markdown(sample, run):
    code, out = run(sample, "render")
    assert code == 0 and "書いた: plot/vol1-state.md" in out
    chars = (sample / "charactor.md").read_text(encoding="utf-8")
    assert "生成物。手で直さない" in chars
    assert "## ハル・ミナト\n\n- 口癖: 「せーので」" in chars
    assert "## 灯台守のじいさん（端役）" in chars
    details = (sample / "details.md").read_text(encoding="utf-8")
    assert "| 灯台守 | とうだいもり | vol1 01:2 場面2、地の文 |" in details
    assert "| 02:2 | 二日目の夕方 | 灯台の扉が開く | 記録なし |" in details
    state = (sample / "plot/vol1-state.md").read_text(encoding="utf-8")
    assert "| 鍵 | ハル | ソラ（01:1） → 守（01:2） → ソラ（02:1） |" in state
    assert "守（はじめから）、ソラ（02:2）、ハル（02:2）" in state
    assert "manuscript/vol1/01.kym.txt:7" in (sample / "plot/map.md").read_text(encoding="utf-8")
    assert "『灯台の鍵を返せ。　守』" in (sample / "plot/documents.md").read_text(encoding="utf-8")


def test_ask_cycle(sample, run):
    code, out = run(sample, "ask", "add", "ハルは鍵の重さを知っているか", "--at", "02:2")
    assert "Q-002" in out
    run(sample, "ask", "settle", "Q-001", "守の昔の仲間")
    _, out = run(sample, "ask", "list")
    assert "Q-002［open］" in out and "Q-001" not in out
    assert "ledger/world.yaml:3 【本文仮】灯台の鍵は一本しかない" in out
    _, out = run(sample, "ask", "list", "--all")
    assert "Q-001［settled］手紙の差出人は誰か（02:1） → 守の昔の仲間" in out
    code, _ = run(sample, "check")
    assert code == 0


def test_stages_and_absent(sample, run):
    _, out = run(sample, "stages")
    assert "| ハル | 他人 | 気になる | 02 |" in out
    path = sample / "ledger/vol1/scenes.yaml"
    path.write_text(path.read_text(encoding="utf-8").replace("cast: [ソラ, 守, ハル]", "cast: [ソラ, 守]")
                    .replace("cast: [ソラ, ハル], summary: 二人", "cast: [ソラ], summary: 二人"), encoding="utf-8")
    _, out = run(sample, "stages")
    assert "| ハル | 他人 | 気になる（不在） | 01 |" in out and "しばらく出ていない" not in out
    path.write_text(path.read_text(encoding="utf-8").replace("cast: [ソラ, ハル]", "cast: [ソラ]"), encoding="utf-8")
    _, out = run(sample, "stages")
    assert "しばらく出ていない（2 章以上）: ハル" in out


def test_add_keeps_order(sample, run):
    code, out = run(sample, "add", "know", "--at", "01:2", "--who", "ハル", "--what", "鍵は灯台のもの")
    assert code == 0
    w = load(sample)
    pts = [e["_pt"] for e in w.events]
    assert pts == sorted(pts)
    assert any(e.get("who") == "ハル" and e["what"] == "鍵は灯台のもの" for e in w.events)
    code, out = run(sample, "check")
    assert code == 0


def test_add_rejects_bad_input(sample, run):
    assert run(sample, "add", "拾う", "--at", "01:1", "--what", "鍵")[0] == 2
    assert run(sample, "add", "知る", "--at", "01:2", "--who", "ハル", "--what", "x")[0] == 2
    assert run(sample, "add", "move", "--at", "01:1", "--what", "鍵")[0] == 2  # to が無い
    assert run(sample, "add", "know", "--at", "05:1", "--who", "ソラ", "--what", "x")[0] == 2


def test_ask_list_questions_only(sample, run):
    _, out = run(sample, "ask", "list", "--questions")
    assert "Q-001［open］" in out and "【本文仮】" not in out
    _, out = run(sample, "ask", "list", "--questions", "--json")
    assert "provisional" not in out


def test_ask_add_settle_quiet(sample, run):
    code, out = run(sample, "ask", "add", "Q-001 と同じ人か", "--at", "02:1", "--settle", "別人", "--quiet")
    assert code == 0 and out == "Q-002\n"
    _, out = run(sample, "ask", "list", "--all", "--questions")
    assert "Q-002［settled］Q-001 と同じ人か（02:1） → 別人" in out
    assert "Q-001［open］" in out
