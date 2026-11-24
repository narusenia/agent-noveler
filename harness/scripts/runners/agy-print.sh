#!/usr/bin/env bash
# 役をagy -p（printモード）で動かす実行器。ふつうはask.sh から呼ばれる。
#   agy-print.sh <役> <名前> <依頼文のファイル> [モデル] [作品のフォルダ]
# roles.tomlの[agy] allow_print = trueのときだけ動く（agy -p を他のエージェントから呼ぶと利用規約に触れることがあるため、既定は止める）。
# 同じ名前なら同じ会話に続ける（会話のID は.git/ask/<名前>.agy に残す）。
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
role=${1:?役}; name=${2:?名前}; src=${3:?依頼文のファイル}; model=${4:-}; work=${5:-}
allow=$(python3 "$here/role.py" --setting agy.allow_print ${work:+--work "$work"})
[ "$allow" = true ] || { echo "agy -p は roles.toml の [agy] allow_print = true のときだけ使える（今は ${allow:-false}）" >&2; exit 5; }

root=$(git rev-parse --show-toplevel)
state="$(git rev-parse --git-dir)/ask/${name//[^A-Za-z0-9_-]/_}.agy"; mkdir -p "$(dirname "$state")"
conv=(); [ -s "$state" ] && conv=(--conversation "$(cat "$state")")
out=$(cd "$root" && agy --agent "$role" --mode auto ${model:+--model "$model"} ${conv[@]+"${conv[@]}"} \
  --output-format json -p "$(cat "$src")")
printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["conversation_id"])' >"$state"
printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["response"].rstrip())'
