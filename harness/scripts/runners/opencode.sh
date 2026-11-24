#!/usr/bin/env bash
# 役をOpenCode（API課金）で動かす実行器。ふつうはask.sh から呼ばれる。
#   opencode.sh <役> <セッション名> <依頼文のファイル> [モデル]
# 同じ役・同じセッション名なら会話を続ける（指示や原稿を読み直させない）。
# herdrの中（HERDR_ENV=1）では、最初の呼び出しでwrite paneを立て、以後の依頼もそのpane に送る。
# GoogleのAPIの一分あたりの上限で止まったら、同じセッションのままOpenRouter 経由の同じモデル（OPENCODE_FALLBACK_MODEL）に
# 切り替えて「続きから」を送る（OpenRouterの額が別にかかる）。そこでも止まったら一分待って送り直す（OPENCODE_RETRIES回まで）。
# 終わるまで待ち、出力の末尾と今日の額を表示する。
set -euo pipefail
agent=${1:?role}; name=${2:?session name}; prompt=$(cd "$(dirname "${3:?request file}")" && pwd)/$(basename "$3")
root=$(git rev-parse --show-toplevel)
model=${4:-google/gemini-4-hydrogen}
fallback=${OPENCODE_FALLBACK_MODEL:-openrouter/$model}
sid="ses_${agent}_${name//[^A-Za-z0-9_]/_}"
log=$(mktemp -t writer); resume=$(mktemp -t writer)
echo "さっきの作業は API の一分あたりの上限で途中で止まった。すでに入れたものはやり直さず、ファイルを読み直して続きから終わりまで進めてほしい。終わったら、最初の依頼どおりに報告を返して。" > "$resume"

pane=""
if [ "${HERDR_ENV:-}" = 1 ]; then
  state="$(git rev-parse --git-dir)/writer-pane"
  pane=$(cat "$state" 2>/dev/null || true)
  if [ -z "$pane" ] || ! herdr pane get "$pane" >/dev/null 2>&1; then
    pane=$(herdr pane split --current --direction down --no-focus --cwd "$root" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
    herdr pane rename "$pane" "write" >/dev/null
    echo "$pane" > "$state"
  fi
fi

run_once() { # $1: 依頼文のファイル。出力は$logに残す
  local cmd="opencode run -s $sid --agent $agent -m $model --auto --title '$agent $name' \"\$(cat '$1')\" 2>&1 | tee '$log'"
  if [ -z "$pane" ]; then
    (cd "$root" && eval "$cmd")
  else
    local ts; ts=$(date +%s)
    # 打った行が印に当たらないよう、echoの引数を割って書く
    herdr pane run "$pane" "cd '$root' && $cmd; echo __WRITER_DONE_\"\"${ts}__" >/dev/null
    herdr pane wait-output "$pane" --match "__WRITER_DONE_${ts}__" --source recent-unwrapped \
      --timeout "${OPENCODE_TIMEOUT_MS:-5400000}" >/dev/null
  fi
}

run_once "$prompt"
for _ in $(seq "${OPENCODE_RETRIES:-5}"); do
  grep -q "exceeded your current quota" "$log" || break
  if [ "$model" != "$fallback" ]; then
    echo "(stopped at the API rate limit; switching to $fallback and sending the rest)"; model=$fallback
  else
    echo "(stopped at the API rate limit; waiting a minute and sending the rest)"; sleep 65
  fi
  run_once "$resume"
done
tail -n "${OPENCODE_LINES:-80}" "$log"
cd "$root" && opencode stats --project . --days 0 --cost | grep -m1 -E "^\s+cost" | sed "s/^ */opencode cost today (this repository): /"
