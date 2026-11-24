---
name: syuki
description: |
  小説の執筆支援 CLI「syuki」の使い方。作品の台帳（人物の知っていること・気持ち・持ち物・居場所、場所と道のり、作中の文書、伏線、場面の表）を YAML で持ち、書く前の要約（brief）、検索、照合（check）、lint を出す。
  syuki.yml のある作品で、章を書く・直す・通し読みする前後に使う。
---

# syuki

台帳の正本は作品の `ledger/` の YAML。中身を知りたいときは YAML を直接開かず、下のコマンドで時点を切って引く（`.agents/rules/syuki-first.md`）。書き方は `references/schema.md`。人が読む Markdown（人物・設定・地図・文書・状態表）は `syuki render` の生成物なので、手で直さずに YAML を直して作り直す。

## 呼び方

`syuki` コマンドを入れておく（`uv tool install syuki`。未登録語の照合も使うなら `uv tool install 'syuki[ja]'`）。

```sh
syuki <コマンド> [--json]              # 作品のフォルダで呼ぶ
syuki <コマンド> --work <作品> [--json]  # ほかの場所から呼ぶ
```

`syuki.yml` は `--work` に渡したファイルか、今いるフォルダから上へたどって探す。どのコマンドも `--json` で JSON を出す。根拠は `manuscript/vol1/03.kym.txt:365` の形で出る。

## 書く前（writer）

1. `syuki brief 04:3` — 場面のカード（動機の行も）、筋道メモ、場面の頭で出ている人物ごとの居場所・知っていること・**知らない秘密**・気持ち・持ち物・好意の段階、場所と前の場面からの道のり、関係する文書の正本、近くで予定のある伏線、作者に確認中のこと。本文がまだない章（`syuki brief 06:1`）は、plot のカードと筋道メモに、前の章の終わりの人物の状態を添えて出す（章のファイル名が `06.kym.txt` の形のときだけ）。
2. 迷ったら引く:
   - `syuki search 語 [--at 04:3]` — 本文（その時点より前）・台帳・設定集と plot（見出しと【確定】などのラベル付き）
   - `syuki state 人物 --at 04:3` / `syuki knows 秘密 --at 04:3` / `syuki where 持ち物 --at 04:3`
   - `syuki threads [--at 04:3]`（伏線ごとの置いた・匂わせた・回収した所と予定。回収の予定を過ぎたものに印。`--json` の status は not_planted・planted・paid_off・overdue。done の各行は、出来事に `src` があれば引用と引き直した本文の行 `where`・`line`、迷子なら `lost`）、`syuki list <kind>`（名前の一覧。kind は characters・terms・places・items・secrets・threads・documents。`--json` では人物に short・aliases、用語に reading と説明の desc（台帳の note）を足す。無いものは省く）
   - `syuki timeline`（作中の日時順）、`syuki recap --until 03`（本文の順のあらすじと出来事）
3. 作中の文書を引くときは、`brief` か `plot/documents.md` の正本の字をそのまま使う。

## 書いたあと

1. 場面の表（`ledger/<巻>/scenes.yaml`）に場面ごとの一行を足す。本文の場面転換の数と合わせる。
2. 出来事を記録する。YAML を直接書くか `syuki add know --at 01:4 --who ソラ --what 地下の扉 --src '01「地下の扉を見てみろ」'`（種類は know・feel・move・plant・hint・payoff・stage。知る・気持ち・移る・置く・匂わせる・回収・段階にあたる）伏線の plant・hint・payoff にも `--src` を付けると、`threads` と shosai が本文の場所を引ける。
3. `syuki check` — 違反があれば終了コード 1。「確認」は違反に数えない（登録していない制度・役職・施設らしい語、知る前の人物が秘密の目印の語を口にした所など）。未登録語の照合は sudachipy が要る（`syuki[ja]` で入れる）。無ければ飛ばして知らせる。
4. `syuki lint [章…] [--voice]` — 文体パックの check_style（`.agents/skills/<パック>/scripts/`。パックは roles.toml の `[style] pack`。`--profile` に `style/profile.toml`）と keep_check を章ごとに回し、同じ巻のほかの章より出すぎた語の並び（上位五つ、判断）も出す。読み方は `.agents/rules/prose-tools.md`。
5. `syuki render` — 生成物を作り直す。

## 直したあと

- `syuki impact [git の範囲]` — 本文の差分（既定は HEAD と作業中の本文）から、変えた場面、迷子になった引用、変えた場面の出来事、それに頼っている後ろの出来事を挙げる。迷子があれば終了コード 1。引用（`章「本文の字」`）を今の本文に合わせて直す。
- `syuki style contrast [--dry-run]` — shosai の作者の赤（`review/<巻>.json` の applied・done、地の文）から、今の本文と赤の前の段落の対を、声なしの文が減った順に `style/samples/contrast-candidates.md` へ足す。足した ID と、`contrast.md` に採用済みの ID は飛ばす。判断の材料で、作者が選んだ組を `contrast.md` に移す（spar が送るのは `contrast.md` だけ）。
- `syuki style excess 章（巻が二つ以上なら vol1/04） [--base 03,04] [--top 20]` — 章で基準の章（既定は同じ巻のほかの章）より出すぎた語の並び。Sudachi の原形の 1〜3 語を事前分布つきの対数オッズ（z）で比べる。台帳の人物・用語・場所・持ち物の名前は外し、名詞だけの並びは重みを半分にする。口癖になりかけの言い回しや、章の語りの偏り（「言う」「俺が」の多さなど）を見る材料。
- `syuki style endings [章…]` — 話者の決まった台詞の文末を人物ごとに数え、台帳の口調サンプル（`samples` の「」）の文末と比べる。見本に無い文末の割合と上位、見本にあって使っていない文末を出す。話者は盲検の答えの表 `style/speakers/<巻>/<章>.json`（`{"行番号": "話者"}`）と、同じ行の「と〇〇が言った」から決め、決まらない台詞は数えない。表は本文を直すと行がずれるので、大きく直したら作り直す。
- `syuki style heat 章 [--json]` — check_style の判定（`--paragraphs`）で、段落ごとの声・声なし区間（始まりの行と文の数）・落としを、章のファイル（manuscript/ からのパス）と行番号（frontmatter を含む 1 始まり）つきで出す。shosai の Reader が「声の色」で読む。判定は check_style が正本で、syuki は複製しない。

## 作者に確かめる

- `syuki ask add "質問" [--at 04:3] [--settle "答え"] [--quiet]`（`--settle` で足してすぐ決着、`--quiet` で足した ID だけを出す。ID を拾うときは `--quiet` の出力を使う。質問文を grep しない）
- `syuki ask list [--all] [--questions]`（既定は【本文仮】の確定待ちも出る。`--questions` で作者への問いだけ）、`syuki ask settle Q-003 "答え"`。
- `syuki stages` — 段階を追う人物ごとの章末の段階と、しばらく出ていない人物。

## 新しい作品

`syuki init <作品>` — `syuki.yml` と `ledger/` の雛形を作り、使う文体パックの雛形（`pack.toml` の `templates`。`plot.md`・`style/profile.toml` など）も写す。作品だけの照合は `ledger/checks.py` に書く（`references/schema.md` の最後）。
