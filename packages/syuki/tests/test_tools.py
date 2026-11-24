import json
import shutil

import pytest

from syuki.cli import main


def test_init_creates_skeleton_and_checks_clean(tmp_path, capsys):
    root = tmp_path / "novel"
    assert main(["init", str(root)]) == 0
    for rel in ("syuki.yml", "ledger/places.yaml", "ledger/vol1/events.yaml", "style/profile.toml", "style/keep.md", "plot.md"):
        assert (root / rel).is_file(), rel
    assert main(["init", str(root)]) == 0
    assert "既存:" in capsys.readouterr().out
    assert main(["check", "--work", str(root)]) == 0


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv が無い")
def test_lint_runs_scripts_and_reports_keep(sample, run):
    code, out = run(sample, "lint", "01", "--json")
    data = json.loads(out)
    assert [d["tool"] for d in data] == ["check_style", "keep_check", "excess"]
    assert code == 0
    (sample / "style/keep.md").write_text("- vol1/01.kym.txt: 無い文\n", encoding="utf-8")
    code, _ = run(sample, "lint", "01", "--json")
    assert code == 1


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv が無い")
def test_style_heat_returns_paragraphs_with_manuscript_path(sample, run):
    code, out = run(sample, "style", "heat", "01", "--json")
    data = json.loads(out)
    assert code == 0 and data["file"] == "vol1/01.kym.txt"
    assert data["paragraphs"] and all({"line", "voiced", "run", "drop"} <= set(p) for p in data["paragraphs"])


def test_style_excess_takes_volume_and_chapter(sample, run):
    pytest.importorskip("sudachipy")
    code, out = run(sample, "style", "excess", "vol1/02", "--json")
    assert code == 0 and json.loads(out)["chapter"] == "manuscript/vol1/02.kym.txt"
    code, _ = run(sample, "style", "excess", "vol9/02", "--json")
    assert code == 2
