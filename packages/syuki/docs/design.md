# syuki 設計

AI に小説を書かせるための支援 CLI。エージェント（writer・checker・critic）が、書く前・書いている途中・書いたあとに叩く。作者向けの画面（shosai の横に出す）はあとで、`--json` の出力を読んで作る。

## 背景

AI の書く本文は「なんで？」「無理やりじゃない？」「さっきまでそうじゃなくね？」と言われやすい。原因は、場面カードに動機がないこと、章をまたいで人物の知識・気持ち・持ち物を持ち越していないこと、書いたあとに動機を点検していないこと。syuki はこの三つを台帳と照合で補う。

## 決定事項

1. 主な利用者はエージェント。書いている途中にも使える。lint もこのツールから回す。
2. コードは作品に依存しない。作品ごとの違いは `syuki.yml` で渡し、作品だけの照合は `ledger/checks.py`（任意）で差し込む。
3. Python。`packages/syuki/` に pyproject.toml・`src/syuki/`・`tests/` のパッケージとして置く。呼び方は `uv run --project packages/syuki syuki <サブコマンド>`、リポジトリ直下の package.json に `"syuki"` スクリプトを足して `pnpm syuki …` でも呼べる。全体へのインストールはしない。スキル（`harness/skills/syuki/SKILL.md`）は CLI の使い方を書くだけ。
4. 台帳の正本は YAML。人が読む Markdown は syuki が生成する（頭に「生成物。手で直さない」）。
5. 本文の場所は「章＋短い引用」で指す。行番号は syuki がその時点の本文から引き直す。引用が本文から消えたら迷子として知らせる（shosai と同じ考え方）。
6. 状態は出来事の記録で持つ（知る・気持ちが変わる・持ち物が移る・伏線を置く/匂わせる/回収する・好意の段階が進む）。時点は「章:場面」で指す。場面の番号は本文の場面転換（＊）から数える。どの時点の状態も、そこまでの記録を積み上げて出す。
7. 記録はエージェントが YAML を直接書くか、追記コマンド（`syuki add …`）で足す。どちらでも `syuki check` が検査する。
8. 人物の一覧（characters.md）と設定の一覧（details.md）も YAML から作る生成物にする。変更履歴は git の履歴に任せる。生成する人物の一覧には、lint（check_style）が読む「- 口癖:」の行を今と同じ形で出す。
9. 設定集（`syuki.yml` の `setting`）と場面カード・挿絵口絵の候補（plot/<巻>.md）は Markdown のまま。syuki は見出しと【確定】【未決定】などのラベルを読み取って検索に使う。plot の「伏線」だけ YAML に移す。カードの見出し（「第四章」の「3.」）を本文の章・場面と結びつける。
10. 引くコマンドの柱は `brief <章:場面>`。その場面のカード（動機の行も）、筋道メモ、場面の頭で出ている人物ごとの知っていること・気持ち・持ち物・居場所、場所と道のり、関係する文書の正本、近くで匂わせ・回収の予定がある伏線を、短くまとめて出す。補助に `search 語 [--at 章:場面]`、`state 人物 --at`、`knows 秘密 --at`、`where 持ち物 --at`、`timeline`、`recap --until 章`。
11. 場面の表（`ledger/<巻>/scenes.yaml`）を持つ。場面ごとに作中の日時、場所、出ている人物、カードへの結びつけ、一行のあらすじ。本文の場面の数と合わなければ知らせる。
12. 出力は既定で短い文字（根拠は `manuscript/vol1/03.kym.txt:365` の形）、`--json` も出せる。照合の終了コードは lint と同じ: 違反があれば 1、「確認」だけなら 0。
13. lint の設定は `style/profile.toml` のまま。`syuki.yml` に `style: style/profile.toml` と書き、`syuki lint` は light-novel の lint スクリプト（check_style・keep_check・voice_check）に `--profile` で渡す。lint スクリプトは変えない。
14. `syuki.yml` は、指定したファイルか今いるフォルダから上へたどって、最初に見つかったものを使う。

## 照合（`syuki check`）

違反に数えるもの:
- YAML の形、引用の迷子、場面の数と本文の食い違い、記録の時点の並び、登録していない人物・持ち物の名前
- 作中の文書: 本文の引用が正本と一字一句合うか
- 持ち物: 持っていない人から移していないか、同時に二か所にないか
- 伏線: 回収の予定を過ぎていないか。伏線の文言・keep.md の文・決め台詞が本文に残っているか。置いた・匂わせた・回収した記録（events の plant・hint・payoff）の引用 `src` は、ほかの出来事と同じく迷子を照合し、`threads --json` の `done` に引用と引き直した行（`where`・`line`、迷子なら `lost`）を返す
- 日時と移動: 場面が日時順か、前の場面からの移動時間が地図と合うか
- 用語: 説明した場所より前に使っていないか、一章に新しい用語が二つ以上ないか、「らしい」が一章三回を超えないか

「確認」として出すもの（違反に数えない）:
- 登録していない語: 制度・役職・施設らしい語（「〜監」「〜院」「〜局」など）が台帳と設定集にない
- 知らないはずの知識: 秘密ごとに目印の語を登録し、その秘密を知る前の人物の台詞に目印の語が出た

作品だけの照合: `ledger/checks.py` があれば読みこんで回す。

## そのほかのコマンド

- `init`: 作品のフォルダに `syuki.yml` と `ledger/` の雛形を作る。light-novel の `init_work.py` も呼ぶ。
- `impact [git の範囲]`: 本文の差分から、引用が迷子になった記録と、変えた場面の出来事に頼っている後ろの場面を挙げる。
- `ask`: 作者に確かめたいことの待ち行列（`ledger/questions.yaml`）。追加・一覧・決着の記録。【本文仮】の確定待ちも一覧に出す。
- 好意の段階: ヒロインごとの段階を出来事として記録し、章ごとの進み具合と、しばらく登場していないヒロインを出す（段階の定義は作品の plot/series.md「ヒロインの好意」から `syuki.yml` に写す）。
- `render`: 人物の一覧・設定の一覧・状態表・地図・文書の Markdown を生成する。
- `lint`: 13 のとおり。

shosai との連携: 受信箱で review JSON の質問と `ask` の open を章の順に並べ、`ask settle` で答える。`brief`・`recap`・`timeline`・`check`・`lint`・`threads`・`list`・`state`・`knows`・`where`・`stages`・`style endings`・`excess`・`search`・`impact` を画面に出す。見送り: 挿絵・口絵の候補の台帳化。

## 作品の側の構成

```
<作品のフォルダ>/
  syuki.yml
  ledger/
    characters.yaml  world.yaml  terms.yaml  places.yaml  items.yaml
    secrets.yaml  threads.yaml  documents.yaml  questions.yaml
    checks.py            （任意）
    vol1/
      scenes.yaml  events.yaml
      notes/<章>.md      筋道メモ（writer が書く）
```
