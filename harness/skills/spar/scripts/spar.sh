#!/usr/bin/env bash
# writerの壁打ち相手。同じ名前のあいだ、同じ相手と会話を続ける。
# 使い方:
#   spar.sh start <名前> <ファイル|->   役の指示と最初の材料を送って会話を始める（同じ名前で呼ぶと始め直す）
#   spar.sh ask   <名前> <ファイル|->   同じ会話に続けて送る
# 経路はstart のときのSPAR_ROUTE で決まり、askはそれを引き継ぐ。
#   claude（既定）: claude -p のsonnet（SPAR_MODELで変更）。writerはagy（Gemini）なので、別のモデルの目を入れる。
#   carbon        : opencodeのgoogle/gemini-4-carbon。
set -euo pipefail

[ $# -eq 3 ] || { echo "usage: spar.sh start|ask <name> <file|->" >&2; exit 2; }
act=$1; name=$2; src=$3
here=$(cd "$(dirname "$0")/.." && pwd)
base="${TMPDIR:-/tmp}/spar"; run="$base/run"; mkdir -p "$run"
safe=$(printf '%s' "$name" | tr -c 'A-Za-z0-9' '_')
state="$base/$safe.id"  # 一行目: 経路、二行目: 会話のID
body=$(cat "$src")

case $act in
  start)
    # 既定の相手は.agents/roles.tomlの[helpers.spar]（opencodeは経路名carbon）
    route=${SPAR_ROUTE:-$(python3 "$here/../../scripts/role.py" spar | sed 's/^opencode$/carbon/')}; id=""
    [ "$route" = carbon ] && id="ses_spar_${safe}_$(date +%s)"
    # 作品の見本（地の文の物差し）。作品のフォルダで呼ぶか、SPAR_WORKで作品のフォルダを渡す。一つにつき頭からSPAR_SAMPLE_LINES 行まで。【候補】のcontrast.md は送らない
    samples="${SPAR_WORK:-.}/style/samples"; ex=""
    for f in "$samples"/*.txt "$samples/contrast.md"; do
      [ -f "$f" ] || continue
      [ "${f##*/}" = contrast.md ] && grep -q '【候補】' "$f" && continue
      ex+="### 見本 ${f##*/}"$'\n\n'"$(awk 'NR==1&&/^---$/{f=1;next} f&&/^---$/{f=0;next} !f' "$f" | head -n "${SPAR_SAMPLE_LINES:-80}")"$'\n\n'
    done
    [ -n "$ex" ] && ex+=$'---\n\n'
    # 文体パックの spar の見方（.agents/style/roles/spar.md）があれば、役の指示に足す
    lens="$here/../../style/roles/spar.md"; role=$(cat "$here/role.md"); [ -f "$lens" ] && role+=$'\n\n'"$(cat "$lens")"
    msg="$role"$'\n\n---\n\n'"$ex$body" ;;
  ask)
    [ -f "$state" ] || { echo "no conversation $name. Run start first" >&2; exit 2; }
    route=$(sed -n 1p "$state"); id=$(sed -n 2p "$state"); msg=$body ;;
  *) echo "must be start or ask: $act" >&2; exit 2 ;;
esac

# 作品のフォルダの外で動かし、相手が設定資料を勝手に読まないようにする
cd "$run"
case $route in
  claude)
    # ツールなしで答えだけ返させる。startで会話のIDを決め、askはそれを続ける
    if [ -z "$id" ]; then id=$(uuidgen | tr 'A-Z' 'a-z'); conv=(--session-id "$id"); else conv=(--resume "$id"); fi
    claude -p --tools "" --model "${SPAR_MODEL:-$(python3 "$here/../../scripts/role.py" spar --field model)}" "${conv[@]}" --output-format json "$msg" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["result"].rstrip())' ;;
  agy)
    # roles.tomlの[agy] allow_print = trueのときだけ（agy -p を他のエージェントから呼ぶと規約に触れることがある）
    [ "$(python3 "$here/../../scripts/role.py" --setting agy.allow_print)" = true ] ||
      { echo "the agy route of spar is allowed only when [agy] allow_print = true in roles.toml" >&2; exit 5; }
    conv=(); [ -n "$id" ] && conv=(--conversation "$id")
    out=$(agy --sandbox --disable-slash-commands --model "${SPAR_MODEL:-gemini-3.8-flash-medium}" \
      ${conv[@]+"${conv[@]}"} --output-format json -p "$msg")
    id=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["conversation_id"])')
    printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["response"].rstrip())' ;;
  carbon)
    opencode run --session "$id" -m "${SPAR_MODEL:-google/gemini-4-carbon}" "$msg" 2>/dev/null ;;
  *) echo "route must be claude, carbon or agy (agy only with allow_print = true): ${route}" >&2; exit 2 ;;
esac
printf '%s\n%s\n' "$route" "$id" >"$state"
