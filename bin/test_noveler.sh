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
grep -q '^pack = "light-novel"' "$r/.agents/roles.toml" || fail "style pack"
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
NOVELER_WORK=one "$noveler" new --layout packages "$tmp/shelf"
r=$tmp/shelf
grep -q '"packages/\*"' "$r/pnpm-workspace.yaml" || fail "packages workspace"
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
NOVELER_PACK=general NOVELER_WORK=g "$noveler" new "$tmp/plain"
grep -q '^pack = "general"' "$tmp/plain/.agents/roles.toml" || fail "general pack"
[ "$(readlink "$tmp/plain/.agents/style")" = packs/general ] || fail "style link"
[ -f "$tmp/plain/.agents/skills/general/scripts/check_style.py" ] || fail "general lint"
echo "ok: noveler general pack"
