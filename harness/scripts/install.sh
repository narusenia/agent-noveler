#!/usr/bin/env bash
# ハーネスを原稿のリポジトリに入れる。
#   install.sh <原稿のリポジトリ> [文体パック]   既定のパックは general（packs/ のフォルダ名。light-novel なども選べる）
#
# 1. <リポジトリ>/.agents/ にハーネスを写す（もうあれば止まる）
# 2. 文体パックを.agents/のskills・rules・agentsにつなぐ（link-pack.sh）
# 3. AGENTS.mdが無ければ雛形を写す
# 4. 各ツールが読む場所からリンクを張る
#    Claude Code: .claude/agents・.claude/skills・.claude/rules → .agents/、CLAUDE.md → AGENTS.md
#    OpenCode:    .opencode/agents → .agents/agents
#    Antigravity: GEMINI.md → AGENTS.md
#    Codexとpiは、AGENTS.mdと.agents/skills/をそのまま読むので、リンクは要らない
set -euo pipefail
repo=${1:?usage: install.sh <manuscript-repo> [style-pack]}
pack=${2:-general}
src=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$repo" && pwd)

[ -e "$repo/.agents" ] && { echo "already exists: $repo/.agents" >&2; exit 2; }
mkdir "$repo/.agents"
# 雛形のAGENTS.mdはリポジトリの直下に置くので、.agents/には写さない
(cd "$src" && tar -cf - --exclude AGENTS.md --exclude '__pycache__' .) | (cd "$repo/.agents" && tar -xf -)
bash "$repo/.agents/scripts/link-pack.sh" "$pack"
[ -e "$repo/AGENTS.md" ] || cp "$src/AGENTS.md" "$repo/AGENTS.md"

link() {  # link <リンクの場所> <指す先（リンクの場所からの相対）>
  [ -e "$repo/$1" ] || [ -L "$repo/$1" ] && { echo "skip (exists): $1"; return; }
  mkdir -p "$(dirname "$repo/$1")"
  ln -s "$2" "$repo/$1"
  echo "link: $1 -> $2"
}
link .claude/agents ../.agents/agents
link .claude/skills ../.agents/skills
link .claude/rules ../.agents/rules
link CLAUDE.md AGENTS.md
link .opencode/agents ../.agents/agents
link GEMINI.md AGENTS.md
echo "installed: $repo/.agents (style pack: $pack)"
