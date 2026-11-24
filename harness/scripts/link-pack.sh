#!/usr/bin/env bash
# 文体パックの中身（skills/・rules/・agents/）を、ハーネスの同じ名前のフォルダへシンボリックリンクでつなぐ。
# つないだあとは、パックのスキルや決まりを.agents/skills/<名前> のような今までと同じパスで読める。
#   link-pack.sh <パック>   つなぐ。前につないだパックのリンクは先に外す
#   link-pack.sh --off      外すだけ
# 使うパックはroles.toml の[style] packにも書いておく（first-read がそこから初見読者の人物像を読む）。
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)

if [ "${1:-}" != --off ]; then
  pack=${1:?usage: link-pack.sh <pack>|--off}
  src="$root/packs/$pack"
  [ -f "$src/pack.toml" ] || { echo "not found: packs/$pack/pack.toml" >&2; exit 2; }
fi

# packs/を指すリンクだけを外す。手で置いたファイルには触らない
for d in skills rules agents; do
  for l in "$root/$d"/*; do
    if [ -L "$l" ]; then case $(readlink "$l") in ../packs/*) rm "$l" ;; esac; fi
  done
done
[ "${1:-}" = --off ] && { echo "unlinked"; exit 0; }

for d in skills rules agents; do
  [ -d "$src/$d" ] || continue
  for f in "$src/$d"/*; do
    n=$(basename "$f")
    [ -e "$root/$d/$n" ] && { echo "already exists: $d/$n" >&2; exit 2; }
    ln -s "../packs/$pack/$d/$n" "$root/$d/$n"
  done
done
echo "linked: $pack"
