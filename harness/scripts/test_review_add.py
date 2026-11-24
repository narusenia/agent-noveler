"""review_add.py の確かめ。python3 .agents/scripts/test_review_add.py"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from review_add import add  # noqa: E402

with tempfile.TemporaryDirectory() as d:
    work = Path(d) / "mywork"
    (work / "manuscript" / "vol1").mkdir(parents=True)
    (work / "manuscript" / "vol1" / "01.kym.txt").write_text("---\ntitle: 一\n---\n　海に、霧が出ていた。霧は濃い。\n", encoding="utf-8")
    e1 = add(work, "vol1/01.kym.txt", "霧", "replace", "靄", "", nth=1)
    e2 = add(work, "vol1/01.kym.txt", "海に", "comment", None, "海の色を一言")
    r = json.loads((work / "review" / "vol1.json").read_text(encoding="utf-8"))
    assert (r["work"], r["vol"]) == ("mywork", "vol1")
    assert (e1["id"], e1["line"], e1["prefix"], e1["suffix"], e1["before"], e1["after"]) == ("R-0001", 4, "　海に、霧が出ていた。", "は濃い。", "霧", "靄")
    assert e2["id"] == "R-0002" and "after" not in e2 and e2["status"] == "open"
print("ok")
