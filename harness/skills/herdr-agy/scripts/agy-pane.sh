#!/usr/bin/env bash
# 役（agy）を動かすペインを一つ用意して、そのpane_id を出す。
# メインの会話のタブは割らず、同じワークスペースの「agy」タブにまとめる（作者が会話のタブで作業を続けられるように）。
#   - agyタブが無ければ作り、そのはじめのペインを使う。
#   - agyタブにエージェントの無い空のシェルがあれば、それを使う。
#   - どちらも無ければ、agyタブの最後のペインを割る（二つ目は右、三つ目からは下）。
# 使い方: agy-pane.sh <cwd>。AGY_PANE_NEW=1 なら空のシェルを使い回さず必ず割る（cwd が違うときに使う）
set -euo pipefail
cwd=${1:?cwd}
ws=${HERDR_WORKSPACE_ID:?herdr の中で呼ぶ}

tab=$(herdr tab list | python3 -c '
import json,sys
ws=sys.argv[1]
for t in json.load(sys.stdin)["result"]["tabs"]:
    if t["workspace_id"]==ws and t["label"]=="agy": print(t["tab_id"]); break' "$ws")

if [ -z "$tab" ]; then
  herdr tab create --workspace "$ws" --label agy --cwd "$cwd" --no-focus |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])'
  exit
fi

# 空のシェル（エージェントが無い）を探す。無ければ最後のペインと数を出す
read -r free last count < <(herdr pane list | python3 -c '
import json,sys
tab=sys.argv[1]
ps=[p for p in json.load(sys.stdin)["result"]["panes"] if p["tab_id"]==tab]
free=next((p["pane_id"] for p in ps if not p.get("agent")),"-")
print(free, ps[-1]["pane_id"] if ps else "-", len(ps))' "$tab")

if [ "$free" != - ] && [ -z "${AGY_PANE_NEW:-}" ]; then echo "$free"; exit; fi
dir=down; [ "$count" = 1 ] && dir=right
herdr pane split "$last" --direction "$dir" --cwd "$cwd" --no-focus |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])'
