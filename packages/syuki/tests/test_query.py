import json


def test_brief_has_card_state_documents_threads(sample, run):
    code, out = run(sample, "brief", "02:1")
    assert code == 0
    assert "動機: 守は鍵を返す相手を見極めたい。" in out
    assert "手紙は守の昔の仲間から" in out  # 筋道メモの場面1の節
    assert "二人で回す所" not in out
    assert "- 守 (place: 詰所 01:2)" in out
    assert "unknown secrets: 二人鍵" in out
    assert "『灯台の鍵を返せ。　守』" in out
    assert "planned: payoff 02:2" in out
    assert "Q-001" in out


def test_brief_routes_from_previous_place(sample, run):
    _, out = run(sample, "brief", "02:2")
    assert "route 灯台→詰所: 坂を下りる／歩いて四半刻" in out


def test_brief_json(sample, run):
    _, out = run(sample, "brief", "02:2", "--json")
    data = json.loads(out)
    hal = next(c for c in data["cast"] if c["name"] == "ハル")
    assert hal["stage"]["what"] == "気になる"


def test_state_is_scene_head(sample, run):
    _, out = run(sample, "state", "ソラ", "--at", "02:2")
    assert "二人鍵" in out.split("unknown secrets")[1]
    _, out = run(sample, "state", "ソラ")
    assert "knows: 鍵は灯台のもの（01:2）、二人鍵（02:2）" in out


def test_knows_and_where(sample, run):
    _, out = run(sample, "knows", "二人鍵")
    assert "knows: ソラ（02:2）" in out and "守（はじめから）" in out
    _, out = run(sample, "where", "古い鍵", "--at", "02:1")
    assert "now 守" in out


def test_search_respects_at(sample, run):
    _, out = run(sample, "search", "扉", "--at", "02:1")
    assert "manuscript/vol1/02.kym.txt" not in out
    _, out = run(sample, "search", "扉")
    assert "02.kym.txt:13 (02:1)" in out
    assert "title:" not in out


def test_timeline_and_recap(sample, run):
    _, out = run(sample, "timeline")
    assert out.index("01:2") < out.index("02:1")
    _, out = run(sample, "recap", "--until", "01")
    assert "01:2" in out and "02:1" not in out


def test_unknown_names_exit_2(sample, run):
    code, _ = run(sample, "state", "誰か")
    assert code == 2


def test_threads_shows_progress_and_plan(sample, run):
    _, out = run(sample, "threads", "--at", "02:1")
    assert "## 二人の扉 (planted)" in out
    assert "- plant 01:1" in out
    assert "- planned: payoff 02:2（二人で回して開く）" in out
    _, out = run(sample, "threads")
    assert "## 二人の扉 (paid off)" in out


def test_threads_marks_overdue(sample, run):
    events = sample / "ledger" / "vol1" / "events.yaml"
    events.write_text(events.read_text(encoding="utf-8").replace("- {at: \"02:2\", kind: payoff, what: 二人の扉}\n", ""),
                      encoding="utf-8")
    _, out = run(sample, "threads")
    assert "overdue" in out


def test_threads_json_resolves_src(sample, run):
    events = sample / "ledger" / "vol1" / "events.yaml"
    events.write_text(events.read_text(encoding="utf-8").replace(
        "kind: payoff, what: 二人の扉}", "kind: payoff, what: 二人の扉, src: 02「無い字」}"), encoding="utf-8")
    _, out = run(sample, "threads", "--json")
    done = json.loads(out)["threads"][0]["done"]
    assert done[0]["src"] == "01「それ、私のよ」"
    assert done[0]["where"].startswith("manuscript/vol1/01.kym.txt:") and done[0]["line"] > 0
    assert done[1]["src"] == "02「無い字」" and "迷子" in done[1]["lost"] and "line" not in done[1]
    _, out = run(sample, "check")
    assert "無い字" in out


def test_list_json_has_ledger_fields(sample, run):
    _, out = run(sample, "list", "characters", "--json")
    mamoru = next(r for r in json.loads(out) if r.get("short") == "守")
    assert mamoru["aliases"] == ["じいさん"]
    _, out = run(sample, "list", "terms", "--json")
    rows = {r["name"]: r for r in json.loads(out)}
    assert rows["灯台守"]["reading"] == "とうだいもり" and rows["灯台守"]["desc"] == "場面2、地の文"
    assert rows["灯台"]["note"] == "とうだい" and "desc" not in rows["灯台"]


def test_list_kinds(sample, run):
    code, out = run(sample, "list", "threads")
    assert code == 0 and "- 二人の扉 — 鍵の持ち主が二人いる" in out
    _, out = run(sample, "list", "characters")
    assert out.startswith("- ")
    code, _ = run(sample, "list", "伏線")
    assert code == 2


def test_render_state_has_threads(sample, run):
    run(sample, "render")
    assert "## 4. 伏線の進み" in (sample / "plot" / "vol1-state.md").read_text(encoding="utf-8")


def test_brief_unwritten_chapter_uses_plot_and_previous_end(sample, run):
    plot = sample / "plot/vol1.md"
    plot.write_text(plot.read_text(encoding="utf-8") + "\n### 第三章（`03.kym.txt`）\n\n1. 夜: 灯台に灯がともる。\n   - 動機: ハルは鍵の重さを確かめたい。\n",
                    encoding="utf-8")
    (sample / "ledger/vol1/notes/03.md").write_text("## 1\n\n- 灯は守がともす。\n", encoding="utf-8")
    code, out = run(sample, "brief", "03:1")
    assert code == 0
    assert "not written yet; cast as of the end of 02:2" in out
    assert "動機: ハルは鍵の重さを確かめたい。" in out and "灯は守がともす。" in out
    assert "- ハル (place: 灯台 02:2)" in out
    code, _ = run(sample, "brief", "09:1")
    assert code == 2
