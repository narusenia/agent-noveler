#!/usr/bin/env bash
# 本文だけを束ねて、Geminiに初見読者として読ませる。
# 使い方: read.sh carbon|flash 出力ファイル 章ファイル...
#   carbon: opencodeのgoogle/gemini-4-carbon（巻を通す重い読み。FIRST_READ_MODELで変更）
#   flash : herdrの隣のペインで動くagyのgemini-3.8-flash-medium（章ごとの軽い読み。FIRST_READ_FLASH_MODELで変更）。
#           herdrの中から呼ぶ（HERDR_ENV=1）。agy -p は使わない。
set -euo pipefail

[ $# -ge 3 ] || { echo "usage: read.sh carbon|flash OUTPUT_FILE CHAPTER_FILE..." >&2; exit 2; }
route=$1; shift
mkdir -p "$(dirname "$1")"
out="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; shift
here=$(cd "$(dirname "$0")/.." && pwd)

# 作品のフォルダの外の空のフォルダで動かし、設定資料に手が届かないようにする
work=$(mktemp -d "${TMPDIR:-/tmp}/first-read.XXXXXX")
trap 'rm -rf "$work"' EXIT
python3 "$here/scripts/bundle.py" "$work" "$@" >/dev/null
# 初見読者の人物像は、使っている文体パックのものを使う。パックに無ければ汎用のもの
pack=$(python3 "$here/../../scripts/role.py" --setting style.pack)
prompt_file="$here/../../packs/$pack/first-read/prompt.md"
[ -n "$pack" ] && [ -f "$prompt_file" ] || prompt_file="$here/prompt.md"
prompt=$(cat "$prompt_file")

case $route in
  carbon)
    (cd "$work" && opencode run --archived --title first-read \
      -m "${FIRST_READ_MODEL:-$(python3 "$here/../../scripts/role.py" first-read-heavy --field model)}" --file book.txt "$prompt") >"$out" ;;
  flash)
    if [ "${HERDR_ENV:-}" != 1 ]; then
      # herdrの外では、roles.tomlの[agy] allow_print = trueのときだけagy -p で読む
      [ "$(python3 "$here/../../scripts/role.py" --setting agy.allow_print)" = true ] ||
        { echo "not running inside herdr. Restart inside herdr, or set [agy] allow_print = true in roles.toml" >&2; exit 3; }
      (cd "$work" && agy --sandbox --disable-slash-commands \
        --model "${FIRST_READ_FLASH_MODEL:-$(python3 "$here/../../scripts/role.py" first-read-light --field model)}" \
        -p "このフォルダの book.txt が本文です。$prompt") >"$out"
    else
    # 束のフォルダでagy を対話で起動し、報告をreport.md に書かせて待つ。読み終えたらペインを閉じる
    name="fr-$(date +%s)"
    pane=$(AGY_PANE_NEW=1 bash "$here/../herdr-agy/scripts/agy-pane.sh" "$work")
    trap 'herdr pane close "$pane" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
    # 割った直後はシェルの準備ができておらずagent_pane_busy で断られるので、少し待って試し直す
    for i in 1 2 3 4 5 6 7 8 9 10; do
      herdr agent start "$name" --kind agy --pane "$pane" --timeout 120000 -- \
        --sandbox --model "${FIRST_READ_FLASH_MODEL:-$(python3 "$here/../../scripts/role.py" first-read-light --field model)}" >/dev/null && break
      # エラーでも名前が登録されていれば起動はできている（試し直すとagent_name_taken になる）
      herdr agent get "$name" >/dev/null 2>&1 && break
      [ $i = 10 ] && exit 1; sleep 1
    done
    status() { herdr agent get "$name" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["agent"]["agent_status"])'; }
    # 起動直後の確認（新しい作業フォルダの信頼など）で止まったら、作者がペインで答えて待ち受けに戻るまで待つ
    while [ "$(status)" = blocked ]; do
      echo "agy is waiting at a startup prompt (pane: ${name}). Waiting for the author to answer" >&2
      herdr agent wait "$name" --until idle --until done --until working --timeout "${FIRST_READ_TIMEOUT:-1800000}" >/dev/null
    done
    herdr agent wait "$name" --until idle --until done --timeout 120000 >/dev/null
    herdr agent prompt "$name" "このフォルダの book.txt が本文です。$prompt

---
報告はこのフォルダの report.md に書いて止まる。" --wait --timeout "${FIRST_READ_TIMEOUT:-1800000}" >/dev/null
    while [ ! -s "$work/report.md" ] && [ "$(herdr agent get "$name" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["agent"]["agent_status"])')" = blocked ]; do
      echo "agy is waiting for approval (pane: ${name}). Waiting for the author to answer" >&2
      herdr agent wait "$name" --until working --timeout "${FIRST_READ_TIMEOUT:-1800000}" >/dev/null
      herdr agent wait "$name" --until idle --until done --until blocked --timeout "${FIRST_READ_TIMEOUT:-1800000}" >/dev/null
    done
    cp "$work/report.md" "$out" 2>/dev/null || herdr agent read "$name" --lines 200 >"$out"
    fi ;;
  *) echo "route must be carbon or flash: $route" >&2; exit 2 ;;
esac
[ -s "$out" ] || { echo "Gemini returned an empty reply: $out" >&2; exit 1; }
# 報告の引用を本文と突き合わせ、本文に無い引用（作り話の疑い）を報告の末尾に足す
python3 "$here/scripts/check_quotes.py" "$out" "$work/book.txt" | tee -a "$out" || true
echo "$out"
