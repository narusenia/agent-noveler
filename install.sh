#!/usr/bin/env bash
# agent-noveler を入れる。
#   curl -fsSL https://raw.githubusercontent.com/narusenia/agent-noveler/main/install.sh | bash
#   … | bash -s -- --tools mise      道具（node・pnpm・uv・gum）を mise で揃える
#
# 1. 道具の管理を選ぶ（mise / plain。NOVELER_TOOLS か --tools でも渡せる）
# 2. git・uv・node 22+ を確かめる（plain のとき。無ければ入れ方を示して止まる。勝手に入れない）
# 3. ${AGENT_NOVELER_HOME:-~/.local/share/agent-noveler} に clone（あれば pull）
# 4. noveler _setup: gum（plain のとき noveler のフォルダに落とす）、syuki（uv tool）、~/.local/bin/noveler のリンク
set -euo pipefail
home=${AGENT_NOVELER_HOME:-$HOME/.local/share/agent-noveler}
url=${AGENT_NOVELER_REPO:-https://github.com/narusenia/agent-noveler}
tools=${NOVELER_TOOLS:-}
while [ $# -gt 0 ]; do
  case $1 in --tools) tools=${2:?--tools mise|plain}; shift 2 ;; *) echo "unknown: $1" >&2; exit 2 ;; esac
done

tty() { [ -r /dev/tty ] && [ -z "${NOVELER_YES:-}" ] && (exec </dev/tty) 2>/dev/null; }
# curl | bash では標準入力が台本なので、問いは /dev/tty から読む
pick() {  # pick <問い> <既定> <選択肢...>
  local q=$1 d=$2 r
  shift 2
  tty || { echo "$d"; return; }
  if command -v gum >/dev/null; then gum choose --header "$q" --selected "$d" "$@" </dev/tty; return; fi
  read -r -p "${q}（$*）[$d]: " r </dev/tty
  echo "${r:-$d}"
}

if [ -z "$tools" ]; then
  d=plain; command -v mise >/dev/null && d=mise
  tools=$(pick "道具（node・pnpm・uv・gum）を mise で管理しますか" $d mise plain)
fi
if [ "$tools" = mise ] && ! command -v mise >/dev/null; then
  echo "mise が見つかりません。入れ方: curl https://mise.run | sh （https://mise.jdx.dev）"
  [ "$(pick "どうしますか" stop plain stop)" = plain ] || exit 1
  tools=plain
fi
case $tools in mise | plain) ;; *) echo "--tools は mise か plain: $tools" >&2; exit 2 ;; esac

missing=0
need() {  # need <コマンド> <入れ方>
  command -v "$1" >/dev/null || { echo "見つかりません: $1 — 入れ方: $2"; missing=1; }
}
need git "https://git-scm.com/downloads"
if [ "$tools" = plain ]; then
  need uv "curl -LsSf https://astral.sh/uv/install.sh | sh （https://docs.astral.sh/uv/）"
  need node "Node.js 22 以上を https://nodejs.org/ から"
  if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
    echo "Node.js が古い: $(node -v)（22 以上が要る）"; missing=1
  fi
fi
[ $missing = 0 ] || { echo "上の道具を入れてから、もう一度実行してください。"; exit 1; }

if [ -d "$home/.git" ]; then
  git -C "$home" pull --ff-only
else
  mkdir -p "$(dirname "$home")"
  git clone --depth 1 "$url" "$home"
fi
printf 'tools=%s\n' "$tools" >"$home/config"
bash "$home/bin/noveler" _setup
echo "入りました（道具の管理: ${tools}）。noveler help でコマンドの一覧、noveler new で原稿のリポジトリを作れます。"
