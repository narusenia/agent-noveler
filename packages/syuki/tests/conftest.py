import shutil
from pathlib import Path

import pytest

from syuki.cli import main
from syuki.work import Work

SAMPLE = Path(__file__).parent / "sample"


@pytest.fixture
def sample(tmp_path):
    """見本の作品を tmp に写す（書き換えるテストのため）。"""
    dest = tmp_path / "sample"
    shutil.copytree(SAMPLE, dest)
    return dest


@pytest.fixture
def run(capsys):
    def _run(root, *args):
        code = main([*args, "--work", str(root)])
        return code, capsys.readouterr().out
    return _run


def load(root) -> Work:
    return Work(Path(root) / "syuki.yml")
