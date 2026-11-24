import pytest

from conftest import load
from syuki.work import Point, plain


def test_plain_strips_ruby_emphasis_and_space():
    assert plain("　｜灯台《とうだい》の《《二人》》") == "灯台の二人"


def test_chapters_and_scenes(sample):
    w = load(sample)
    assert [c.id for c in w.chapters] == ["01", "02"]
    assert [c.scenes for c in w.chapters] == [2, 2]
    assert w.point("02:2") == Point(0, 1, 2)
    assert w.label(Point(0, 1, 2)) == "02:2"


def test_point_errors(sample):
    w = load(sample)
    with pytest.raises(ValueError):
        w.point("02:3")
    with pytest.raises(ValueError):
        w.point("09:1")


def test_resolve_with_ruby_in_text(sample):
    hit = load(sample).resolve("01「灯台の下で」")
    assert hit.where == "manuscript/vol1/01.kym.txt:7"
    assert hit.scene == 1
    hit = load(sample).resolve("01「灯台守の詰所」")
    assert (hit.line, hit.scene) == (19, 2)


def test_resolve_lost(sample):
    with pytest.raises(ValueError, match="迷子"):
        load(sample).resolve("01「無い字」")


def test_ten_thirty_stays_text(sample):
    (sample / "ledger/vol1/scenes.yaml").write_text('- {at: "01:1", time: 10:30}\n', encoding="utf-8")
    w = load(sample)
    assert w.scenes[0]["time"] == "10:30"


def test_sample_check_is_clean(sample, run):
    code, out = run(sample, "check")
    assert code == 0, out


def test_check_reports_shape_and_lost_anchor(sample, run):
    (sample / "ledger/items.yaml").write_text("- name: 鍵\n  colour: 赤\n", encoding="utf-8")
    (sample / "ledger/terms.yaml").write_text("- term: 灯台守\n  explained: 01「無い字」\n", encoding="utf-8")
    code, out = run(sample, "check")
    assert code == 1
    assert "知らない項目 colour" in out
    assert "迷子" in out
