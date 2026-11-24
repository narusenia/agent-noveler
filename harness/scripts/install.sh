#!/usr/bin/env bash
# ハーネスを原稿のリポジトリに入れる。
#   install.sh <原稿のリポジトリ> [文体パック]            入れる。既定のパックは general（packs/ のフォルダ名。light-novel なども選べる）
#   install.sh --update <原稿のリポジトリ> [文体パック]   入れ直す。.agents/.harness-manifest にあるファイルだけを入れ替える
#   install.sh --manifest <原稿のリポジトリ>             一覧の無い古いリポジトリで、ハーネスから来たファイルの一覧を作る
#
# 1. <リポジトリ>/.agents/ にハーネスを写す（入れるときは、もうあれば止まる）
# 2. 文体パックを.agents/のskills・rules・agentsにつなぐ（link-pack.sh）
# 3. AGENTS.mdが無ければ雛形を写す
# 4. 各ツールが読む場所からリンクを張る
#    Claude Code: .claude/agents・.claude/skills・.claude/rules → .agents/、CLAUDE.md → AGENTS.md
#    OpenCode:    .opencode/agents → .agents/agents
#    Antigravity: GEMINI.md → AGENTS.md
#    Codexとpiは、AGENTS.mdと.agents/skills/をそのまま読むので、リンクは要らない
# 5. 写したファイルとパックのリンクの一覧を .agents/.harness-manifest に書く。
#    入れ直すときは一覧のファイルだけを消して写し直すので、原稿のリポジトリが足したもの（スキル・役・決まり）と roles.toml は残る
set -euo pipefail
mode=install
case ${1:-} in --update | --manifest) mode=${1#--}; shift ;; esac
repo=${1:?usage: install.sh [--update|--manifest] <manuscript-repo> [style-pack]}
pack=${2:-general}
src=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$repo" && pwd)
man=$repo/.agents/.harness-manifest

# ハーネスのファイルの一覧（.agents/ からの相対）。雛形の AGENTS.md はリポジトリの直下に置くので外す
shipped() { (cd "$src" && find . \( -path ./AGENTS.md -o -name __pycache__ \) -prune -o \( -type f -o -type l \) -print | sed 's|^\./||'); }
# 一覧を書く: ハーネスのファイルのうち .agents/ にあるものと、パックへのリンク
write_manifest() {
  {
    shipped | while IFS= read -r p; do if [ -e "$repo/.agents/$p" ] || [ -L "$repo/.agents/$p" ]; then echo "$p"; fi; done
    (cd "$repo/.agents" && find skills rules agents style -maxdepth 1 -type l 2>/dev/null || true) | while IFS= read -r p; do
      case $(readlink "$repo/.agents/$p") in ../packs/* | packs/*) echo "$p" ;; esac
    done
  } | sort -u >"$man"
}
# ハーネスを写す。.agents/ にもうあるもの（入れ直しで残した roles.toml と、作品側が足したもの）は上書きしない
copy() {
  local tmp p d
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/harness.XXXXXX")
  (cd "$src" && tar -cf - --exclude AGENTS.md --exclude '__pycache__' .) | (cd "$tmp" && tar -xf -)
  while IFS= read -r p; do
    d=$repo/.agents/$p
    if [ -e "$d" ] || [ -L "$d" ]; then
      [ "$p" = roles.toml ] || echo "kept (not in the old list): $p"
      continue
    fi
    mkdir -p "$(dirname "$d")"
    mv "$tmp/$p" "$d"
  done < <(shipped)
  rm -rf "$tmp"
}

case $mode in
  manifest)
    [ -d "$repo/.agents" ] || { echo "not found: $repo/.agents" >&2; exit 2; }
    [ -e "$man" ] && { echo "already exists: $man" >&2; exit 2; }
    write_manifest
    echo "wrote: $man ($(wc -l <"$man" | tr -d ' ') files). Remove the lines for files you changed and want to keep, then update again."
    exit 0 ;;
  update)
    if [ ! -f "$man" ]; then
      echo "No list of harness files: $man" >&2
      echo "Not reinstalling, so files you added to .agents/ are not lost. To create the list:" >&2
      echo "  bash $src/scripts/install.sh --manifest $repo" >&2
      echo "It lists the files in .agents/ that the harness also has. Check it, then update again." >&2
      exit 3
    fi
    while IFS= read -r p; do
      [ "$p" = roles.toml ] && continue  # 担い手とモデルの設定は残す
      f=$repo/.agents/$p
      if [ -L "$f" ] || [ -f "$f" ]; then rm -f "$f"; fi
    done <"$man"
    find "$repo/.agents" -mindepth 1 -depth -type d -empty -delete
    copy
    ;;
  install)
    [ -e "$repo/.agents" ] && { echo "already exists: $repo/.agents" >&2; exit 2; }
    mkdir "$repo/.agents"
    copy
    ;;
esac
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
write_manifest
echo "$mode: $repo/.agents (style pack: $pack)"
