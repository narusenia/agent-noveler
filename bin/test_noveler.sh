#!/usr/bin/env bash
# noveler を gum 無し・非対話で new → add → doctor まで通す。
#   bash bin/test_noveler.sh [作業用フォルダ]   省略時は mktemp -d
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=${1:-$(mktemp -d)}
mkdir -p "$tmp"
tmp=$(cd "$tmp" && pwd)
export NOVELER_NO_GUM=1 NOVELER_YES=1 NOVELER_TOOLS=plain
export NOVELER_SYUKI="uv run --project $root/packages/syuki --extra ja syuki"
noveler=$root/bin/noveler
fail() { echo "FAIL: $*" >&2; exit 1; }

rm -rf "$tmp/novels"
NOVELER_MODE=human NOVELER_WORK=first NOVELER_TITLE='試しの "題"' NOVELER_AUTHOR=作者 "$noveler" new "$tmp/novels"
r=$tmp/novels
[ -d "$r/.git" ] || fail "git init"
grep -q '^write = "human"' "$r/.agents/roles.toml" || fail "mode write"
grep -q '^flow = "standard"' "$r/.agents/roles.toml" || fail "default flow"
grep -q '^pack = "general"' "$r/.agents/roles.toml" || fail "style pack"
[ -f "$r/pnpm-workspace.yaml" ] || fail "pnpm-workspace.yaml"
for f in syuki.yml book.config.js vivliostyle.config.js package.json .gitignore plot.md; do
  [ -f "$r/first/$f" ] || fail "first/$f"
done
[ -d "$r/first/manuscript/vol1" ] || fail "manuscript/vol1"
grep -q 'title: "試しの \\"題\\""' "$r/first/book.config.js" || fail "title in book.config.js"
grep -q 'first_${VOL:-vol1}.pdf' "$r/first/package.json" || fail "pdf name"
node --check "$r/first/book.config.js" || fail "book.config.js syntax"

(cd "$r/first" && NOVELER_TITLE=二作目 "$noveler" add second)
[ -f "$r/second/book.config.js" ] || fail "add second"
(cd "$r/second" && "$noveler" add second) 2>/dev/null && fail "add twice should stop"

(cd "$r" && "$noveler" doctor) | tee "$tmp/doctor.txt"
grep -q 'first: ok' "$tmp/doctor.txt" || fail "doctor first"
grep -q 'second: ok' "$tmp/doctor.txt" || fail "doctor second"
echo "ok: noveler new/add/doctor"

# packages 形: 作品は packages/<作品>/
rm -rf "$tmp/shelf"
NOVELER_WORK=one "$noveler" new --layout packages --flow lite "$tmp/shelf"
r=$tmp/shelf
grep -q '"packages/\*"' "$r/pnpm-workspace.yaml" || fail "packages workspace"
grep -q '^flow = "lite"' "$r/.agents/roles.toml" || fail "--flow lite"
grep -q '"name": "shelf"' "$r/package.json" || fail "root package.json"
grep -q '例 `packages/mywork/`' "$r/AGENTS.md" || fail "AGENTS.md work path"
[ -f "$r/packages/one/book.config.js" ] || fail "packages/one"
[ ! -e "$r/one" ] || fail "work at root in packages layout"
(cd "$r" && "$noveler" add two)
[ -f "$r/packages/two/book.config.js" ] || fail "add packages/two"
(cd "$r" && "$noveler" add shelf) 2>/dev/null && fail "package name clash should stop"
(cd "$r" && "$noveler" doctor) | tee "$tmp/doctor2.txt"
grep -q 'one: ok' "$tmp/doctor2.txt" || fail "doctor one"
grep -q 'two: ok' "$tmp/doctor2.txt" || fail "doctor two"
echo "ok: noveler packages layout"

# 文体パック general を選ぶ
rm -rf "$tmp/plain"
NOVELER_PACK=general NOVELER_FLOW=full NOVELER_WORK=g "$noveler" new "$tmp/plain"
grep -q '^pack = "general"' "$tmp/plain/.agents/roles.toml" || fail "general pack"
grep -q '^flow = "full"' "$tmp/plain/.agents/roles.toml" || fail "NOVELER_FLOW"
[ "$(readlink "$tmp/plain/.agents/style")" = packs/general ] || fail "style link"
[ -f "$tmp/plain/.agents/skills/general/scripts/check_style.py" ] || fail "general lint"
grep -q 緩急 "$tmp/plain/g/style/profile.toml" && fail "general profile template"
echo "ok: noveler general pack"

# 文体パック light-novel を選ぶと、そのパックの雛形が写る
rm -rf "$tmp/ln"
NOVELER_PACK=light-novel NOVELER_WORK=l "$noveler" new "$tmp/ln"
grep -q '^rhythm = "緩急"' "$tmp/ln/l/style/profile.toml" || fail "light-novel profile template"
echo "ok: noveler light-novel pack"

# 入れ直し（noveler update が呼ぶ install.sh --update）: 一覧のファイルだけを入れ替え、作品側が足したものと roles.toml は残す
a=$tmp/ln/.agents
grep -qx agents/critic.md "$a/.harness-manifest" || fail "manifest lists harness files"
grep -qx skills/light-novel "$a/.harness-manifest" || fail "manifest lists pack links"
mkdir -p "$a/skills/foo" && echo mine >"$a/skills/foo/SKILL.md"
echo '# mine' >>"$a/roles.toml"
echo changed >"$a/agents/critic.md"
rm "$a/agents/editor.md"
bash "$root/harness/scripts/install.sh" --update "$tmp/ln" light-novel >/dev/null
[ "$(cat "$a/skills/foo/SKILL.md")" = mine ] || fail "update keeps skills/foo"
grep -qx '# mine' "$a/roles.toml" || fail "update keeps roles.toml"
cmp -s "$a/agents/critic.md" "$root/harness/agents/critic.md" || fail "update replaces harness files"
[ -f "$a/agents/editor.md" ] || fail "update restores removed harness files"
[ "$(readlink "$a/style")" = packs/light-novel ] || fail "update keeps the pack"
grep -qx skills/foo/SKILL.md "$a/.harness-manifest" && fail "manifest lists the work's own files"
python3 "$a/scripts/test_role.py" >/dev/null || fail "test_role in an installed repo with its own roles.toml"
# 一覧の無い古いリポジトリでは入れ直さない
rm "$a/.harness-manifest"
bash "$root/harness/scripts/install.sh" --update "$tmp/ln" 2>/dev/null && fail "update without a manifest should stop"
[ -f "$a/skills/foo/SKILL.md" ] || fail "no-manifest update keeps files"
bash "$root/harness/scripts/install.sh" --manifest "$tmp/ln" >/dev/null
grep -qx agents/critic.md "$a/.harness-manifest" || fail "--manifest"
echo "ok: harness update keeps the work's own files"
