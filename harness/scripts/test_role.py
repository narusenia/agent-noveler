"""role.py の重ね方の確かめ。python3 .agents/scripts/test_role.py"""
import sys
import tomllib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from role import field, merge, resolve  # noqa: E402

cfg = merge(
    tomllib.loads('[defaults]\nrunner="claude"\n[roles.writer]\nrunner="agy"\nfallback={runner="opencode",model="m"}\n[helpers.spar]\nmodel="sonnet"'),
    tomllib.loads('[roles.writer]\nmodel="x"\n[roles.critic]\nrunner="agy"'),  # 作品の上書き
)
w = resolve(cfg, "writer")
assert (w["runner"], w["model"], field(w, "fallback.runner"), field(w, "fallback.model")) == ("agy", "x", "opencode", "m")
assert resolve(cfg, "critic")["runner"] == "agy"
assert resolve(cfg, "editor") == {"runner": "claude"}  # 書いていない役はdefaults
assert (resolve(cfg, "spar")["runner"], resolve(cfg, "spar")["model"]) == ("claude", "sonnet")
assert field(resolve(cfg, "editor"), "fallback.runner") == ""
assert field(merge(tomllib.loads("[agy]\nallow_print=false"), tomllib.loads("[agy]\nallow_print=true")), "agy.allow_print") == "True"
print("ok")

# 既定のroles.toml: 全部の役がclaude、添削モードは切、agy -p は使わない
# 原稿のリポジトリに入れたあと（.harness-manifest がある）は、roles.tomlが作品ごとに書き換わるので見ない
root = Path(__file__).parent.parent
if (root / ".harness-manifest").exists():
    sys.exit(0)
base = tomllib.loads((root / "roles.toml").read_text())
assert all(resolve(base, n)["runner"] == "claude" for n in ["writer", "planner", "critic", "spar", "first-read-light", "first-read-heavy"])
assert (field(base, "mode.write"), field(base, "mode.flow"), field(base, "agy.allow_print"), field(base, "style.pack")) == ("ai", "standard", "False", "general")
assert [resolve(base, n)["model"] for n in ["writer", "critic", "proofreader", "checker", "spar"]] == ["sonnet", "sonnet", "haiku", "haiku", "sonnet"]
print("ok")
