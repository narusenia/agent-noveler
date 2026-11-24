#!/usr/bin/env bash
# 役に作業を頼む入口。担い手は.agents/roles.toml（と作品のroles.toml）で決まる。
#   ask.sh [--work 作品のフォルダ] [--fallback] <役> <名前> <依頼のファイル|->
#   名前は作業ごとに一つ（例: mywork-vol1-04-writer）。同じ名前で送ると同じ会話に続く（直しの往復）。
#   --fallback: 担い手の代わりにfallback（agyの利用枠切れなど）で動かす。
# 担い手がclaude（サブエージェント）の役は、このスクリプトでは動かさない。メインの会話のAgent ツールで頼む。
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=""; fb=""
while [ $# -gt 0 ]; do
  case $1 in
    --work) work=$2; shift 2 ;;
    --fallback) fb=fallback.; shift ;;
    *) break ;;
  esac
done
[ $# -eq 3 ] || { echo "使い方: ask.sh [--work 作品] [--fallback] <役> <名前> <依頼のファイル|->" >&2; exit 2; }
role=$1; name=$2; src=$3
get() { python3 "$here/role.py" "$role" ${work:+--work "$work"} --field "$fb$1"; }
runner=$(get runner); model=$(get model)
[ -n "$runner" ] || { echo "${role} に fallback が無い（roles.toml）" >&2; exit 2; }
# 依頼が標準入力なら、実行器に渡すためにファイルへ落とす
if [ "$src" = - ]; then tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT; cat >"$tmp"; src=$tmp; fi

case $runner in
  claude)
    echo "${role} の担い手は claude（サブエージェント）。メインの会話から Agent ツール（subagent_type: ${role}${model:+、model: ${model}}）で頼む" >&2; exit 4 ;;
  agy)
    HAND_MODEL=$model bash "$here/../skills/herdr-agy/scripts/hand.sh" "$role" "$name" "$src" ;;
  agy-print)
    bash "$here/runners/agy-print.sh" "$role" "$name" "$src" "$model" "$work" ;;
  opencode)
    bash "$here/runners/opencode.sh" "$role" "$name" "$src" ${model:+"$model"} ;;
  *) echo "知らない担い手: ${runner}（claude・agy・agy-print・opencode）" >&2; exit 2 ;;
esac
