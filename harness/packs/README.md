# 文体パックの作り方

役の手順書（`agents/`）とスキル（syuki・spar・first-read）は、ジャンルを問わない言い方で書いてある。ジャンルに固有の書き方と見方は、文体パック `packs/<名前>/` に置く。`scripts/link-pack.sh <名前>` でつなぐと、次のように効く。

| 置くもの | つながる先 | 効くこと |
| --- | --- | --- |
| `pack.toml` | — | パックの中身の一覧（`[provides]`）と、作品ごとに変えられる所（`[customize]`）。無いとつなげない |
| `roles/<役>.md` | `.agents/style/roles/<役>.md` | 役ごとのジャンルの見方。各役が手順書と一緒に読む（例: 主要人物は誰か、何が定番か、lint のどの指摘を場面ごとに見るか）。`roles/spar.md` は spar が壁打ちの相手への指示に足す |
| `skills/<名前>/` | `.agents/skills/<名前>/` | 書き方のスキル。名前はパックと同じにする。`scripts/check_style.py`・`keep_check.py`・`init_work.py` があれば `syuki lint`・`syuki check`・`syuki init` が使う（無ければ lint を飛ばす） |
| `rules/*.md` | `.agents/rules/` | どの役も本文を触る前に読む決まり。役の手順書は `prose-tools.md`（lint と校正の優先順位）を指すので、一つは置く |
| `agents/*.md` | `.agents/agents/` | パックが足す役（今のパックには無い。AI 文の癖を見る slop は核の役で、パックは `roles/slop.md` で見方を足す） |
| `first-read/prompt.md` | — | 初見読者の人物像。無ければスキル first-read の汎用の人物像 |

- パックの中は作品ごとに書き換えない。作品ごとの調整は作品のフォルダの `style/` に置き、`[customize]` に一覧を書く。
- 役の手順書にジャンルの語を足さない。足したくなったら、そのパックの `roles/<役>.md` に書く。
- 別のパックの道具を使うときは、相対リンクで指す（`general` は lint を `light-novel` の `scripts/`・`data/` へのリンクで共有している）。
- 試すときは `bash scripts/install.sh <作業用のリポジトリ> <名前>` で入れ、`syuki lint` と `python3 .agents/scripts/role.py --list` が通ることを見る。
