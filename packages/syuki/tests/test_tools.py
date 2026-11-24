import json
import shutil

import pytest

from syuki import check
from syuki.cli import main


def test_init_creates_skeleton_and_checks_clean(tmp_path, capsys):
    root = tmp_path / "novel"
    assert main(["init", str(root)]) == 0
    for rel in ("syuki.yml", "ledger/places.yaml", "ledger/vol1/events.yaml", "style/profile.toml", "style/keep.md", "plot.md"):
        assert (root / rel).is_file(), rel
    assert main(["init", str(root)]) == 0
    assert "Exists:" in capsys.readouterr().out
    assert main(["check", "--work", str(root)]) == 0
    # 既定のパックの雛形（このリポジトリでは general、原稿のリポジトリでは roles.toml の [style] pack）
    tpl = check.pack_templates(root.resolve()) / "style/profile.toml"
    assert (root / "style/profile.toml").read_text(encoding="utf-8") == tpl.read_text(encoding="utf-8")


def test_init_copies_templates_of_the_chosen_pack(tmp_path):
    root = tmp_path / "novel"
    root.mkdir()
    (root / "roles.toml").write_text('[style]\npack = "light-novel"\n', encoding="utf-8")
    assert main(["init", str(root)]) == 0
    assert 'rhythm = "緩急"' in (root / "style/profile.toml").read_text(encoding="utf-8")
    assert (root / "characters.md").is_file()


def test_init_uses_templates_of_the_installed_harness(tmp_path):
    pack = tmp_path / ".agents" / "packs" / "mine"
    (pack / "tpl" / "style").mkdir(parents=True)
    (pack / "pack.toml").write_text('name = "mine"\n[provides]\ntemplates = "tpl/"\n', encoding="utf-8")
    (pack / "tpl" / "style" / "profile.toml").write_text("# mine\n", encoding="utf-8")
    (tmp_path / ".agents" / "roles.toml").write_text('[style]\npack = "mine"\n', encoding="utf-8")
    root = tmp_path / "novel"
    assert main(["init", str(root)]) == 0
    assert (root / "style/profile.toml").read_text(encoding="utf-8") == "# mine\n"
    assert not (root / "plot.md").exists()


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


def test_lint_scripts_follow_style_pack(tmp_path):
    from syuki.check import lint_scripts

    agents = tmp_path / "repo" / ".agents"
    work = tmp_path / "repo" / "mywork"
    work.mkdir(parents=True)
    for pack in ("general", "light-novel", "mystery"):
        (agents / "skills" / pack / "scripts").mkdir(parents=True)
    assert lint_scripts(work) == agents / "skills" / "general" / "scripts"  # roles.toml が無ければ general
    (agents / "roles.toml").write_text('[style]\npack = "mystery"\n', encoding="utf-8")
    assert lint_scripts(work) == agents / "skills" / "mystery" / "scripts"
    (work / "roles.toml").write_text('[style]\npack = "light-novel"\n', encoding="utf-8")  # 作品の roles.toml が優先
    assert lint_scripts(work) == agents / "skills" / "light-novel" / "scripts"
