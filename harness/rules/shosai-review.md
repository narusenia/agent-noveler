---
trigger: always_on
description: 書斎 shosai の指摘ファイル（review/<巻>.json）を扱うときの決まり
---

# shosai の指摘ファイルを扱うときの決まり

作者は書斎 shosai で本文に赤を入れる。指摘は作品のフォルダの `review/<巻>.json` に溜まる。依頼文で「review/<巻>.json の指摘 R-0012 … を処理して」と頼まれたら、この決まりに従う。依頼はメインの会話が受け、本文の直しは中身に合わせて writer・proofreader などに振る（振るときはこの決まりも渡す）。

## ファイル

- 正本は `review/<巻>.json`。読み書きしてよいのは JSON だけ。
- `review/<巻>.md` は shosai が JSON から作る読み物。手で直さない（次の保存で上書きされる）。

## 1 件の読み方

- `file`（manuscript/ からのパス）・`line`（1 始まり、frontmatter を含む）・`quote`（原稿の該当文字列）で位置を示す。前後の文字は `prefix` / `suffix`。
- 行番号は本文が書き換わるとずれる。`line` の近くで `prefix + quote + suffix` を探して位置を決める。
- `kind`: `suggest`（直しの依頼）、`comment`（作者のメモ）、`replace` / `insert` / `delete` / `ruby` / `emphasis`（作者の赤）、`keep`（残す文。`style/keep.md` に書いてある）。
- `body` が作者の言葉。
- `thread`（無いこともある）は作者とエージェントのやり取り。`{ by: "author" | "agent", body, at }` の並び。最後が作者のものなら、それが作者の答えか追加の注文なので、読んでから処理する。

## 処理したら書き戻す

依頼された ID ごとに、次を更新する。ほかの項目と、依頼されていない指摘は変えない。

- `status`:
  - `done` — 直した
  - `declined` — 直さない。理由を `reply` に書く
  - `question` — 作者の判断が要る。聞きたいことを `reply` に書く
- `reply`: 何をしたかを 1 行（例:「戸口に座りこむ前に、膝が震えていた一文を足した」）。
- `updated`: 書き戻した時刻（ISO 8601）。
- `thread`: `reply` と同じ一言を `{ "by": "agent", "body": …, "at": … }` で末尾に足す。前のやり取りは消さない。

JSON は、書き戻す直前に読み直し、依頼された ID の項目だけを変えて書く。読んでから時間がたった JSON を丸ごと書くと、その間に作者が入れた赤が消える。

本文を直したことで `quote` が原稿から消えても、`quote` などの位置の項目は書き換えない（shosai が迷子として扱う）。

## 作者の赤（`before` / `after` を持つ指摘）

- `status: open` で `before` / `after` を持つものは、作者が入れたい直しで、まだ原稿に入っていない。
  - `file` / `line` / `prefix + quote + suffix` で位置を探す。`quote` は直す前の字（`before`）。挿入は `quote` が空で、`prefix` と `suffix` の間に入れる。
  - `.kym.txt` の `before` を `after` に置き換え、`status: done` にする。`after` は記法（`｜漢字《よみ》`、`《《語》》`）を含むことがあり、そのまま書く。
  - 判断を足すのは、本文が動いて位置がずれたときだけ。もう当てはまらないときは直さず、`declined` か `question` にして理由を `reply` に書く。
- `status: applied` は前の版の赤で、もう原稿に入っている。元に戻さない。作者の直しの傾向として読んでよい（例: どの語を嫌ったか）。

## コミット

依頼文に「コミットはしてよい」とあれば、本文の直しと JSON の書き戻しを同じコミットに入れてよい。
