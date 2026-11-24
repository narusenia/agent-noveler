#!/usr/bin/env bash
# herdrの隣のペインでagy（Gemini）を役割つきで起動し、依頼を渡して終わるまで待つ。
# 使い方:
#   hand.sh <役割> <名前> <依頼のファイル|->
#   役割は.agents/agents/ の名前（planner, writer）。名前は作業ごとに一つ（例: mywork-vol1-03-writer）。
#   同じ名前のagy が生きていれば、その会話に続けて送る（直しの往復）。
# 報告は.hand/<名前>.md に書かせ、終わったらその中身を出す。
# agy -p（裏で動かすprint モード）は使わない。対話のagy をherdr で動かす。
set -euo pipefail

[ $# -eq 3 ] || { echo "usage: hand.sh <role> <name> <request-file|->" >&2; exit 2; }
[ "${HERDR_ENV:-}" = 1 ] || { echo "not running inside herdr. Restart Claude Code inside herdr, then call this" >&2; exit 3; }
role=$1; name=$2; src=$3
root=$(git rev-parse --show-toplevel)
[ -f "$root/.agents/agents/$role.md" ] || { echo "no such role: $role" >&2; exit 2; }
report="$root/.hand/$name.md"; mkdir -p "$root/.hand"; rm -f "$report"
task="$(cat "$src")

---
終わったら、何をしたか・作者に聞くこと・残した問題を ${report#$root/} に書いて止まる。"

if ! herdr agent get "$name" >/dev/null 2>&1; then
  pane=$(bash "$(dirname "$0")/agy-pane.sh" "$root")
  # 割った直後はシェルの準備ができておらずagent_pane_busy で断られるので、少し待って試し直す
  for i in 1 2 3 4 5 6 7 8 9 10; do
    herdr agent start "$name" --kind agy --pane "$pane" --timeout 120000 -- \
      --agent "$role" ${HAND_MODEL:+--model "$HAND_MODEL"} && break
    # エラーでも名前が登録されていれば起動はできている（試し直すとagent_name_taken になる）
    herdr agent get "$name" >/dev/null 2>&1 && break
    [ $i = 10 ] && exit 1; sleep 1
  done
fi

# 承認待ちで止まったら、ペインで作者が答えるまで待ってから続きを待つ
herdr agent prompt "$name" "$task" --wait --timeout "${HAND_TIMEOUT:-3600000}" >/dev/null
status() { herdr agent get "$name" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["agent"]["agent_status"])'; }
until_stop() { herdr agent wait "$name" --until idle --until done --until blocked --timeout "${HAND_TIMEOUT:-3600000}" >/dev/null; }
while :; do
  if [ "$(status)" = blocked ]; then
    echo "agy is waiting for approval (pane: ${name}). Waiting for the author to answer" >&2
    herdr agent wait "$name" --until working --timeout "${HAND_TIMEOUT:-3600000}" >/dev/null
    until_stop; continue
  fi
  [ -f "$report" ] && break
  # 報告がないまま止まった: 裏の作業（sparなど）を待って自分で再開することがあるので、再開を待つ。
  # shortcut: 再開を待つのはHAND_RESUME（既定20 分）まで。それより長い裏の作業があるなら延ばす
  herdr agent wait "$name" --until working --timeout "${HAND_RESUME:-1200000}" >/dev/null 2>&1 || break
  until_stop
done

if [ -f "$report" ]; then cat "$report"
else echo "no report file. Tail of the pane:" >&2; herdr agent read "$name" --lines 60; fi
