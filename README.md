# agent-noveler

Tools for writing Japanese novels with AI agents: **syuki** (a CLI that keeps a story ledger and checks manuscripts against it), **shosai** (a vertical-text viewer for red-pen review and typesetting), and an **agent harness** (role definitions, rules and skills for Claude Code, Codex, pi, OpenCode and Antigravity). Genre-specific know-how lives in swappable style packs; the first one is for light novels.

---

AI と一緒に日本語の小説を書くための道具一式です。原稿そのものは入っていません。試すための短い見本作品だけを同梱しています。

| フォルダ | 中身 | ライセンス |
| --- | --- | --- |
| `packages/syuki/` | 台帳 CLI。人物が何を知っているか、持ち物がどこにあるかなどを YAML の台帳に記録し、場面ごとの引き出しや、本文と照らした矛盾の検出に使う | MIT |
| `packages/shosai/` | 書斎ビューア。縦書きでの通読、赤入れ、組版の見た目の確認。syuki の台帳も横に表示 | AGPL-3.0 |
| `harness/` | エージェントの道具。役（書く、校正する、批評するなど）の手順書、決まり、スキル、役ごとの担い手を決める仕組み、文体パック | MIT |
| `examples/sample-work/` | 見本作品「灯台の鍵」（序章と第一章）。syuki と shosai をそのまま試せる | MIT |

## 入れ方

先に [git](https://git-scm.com/downloads)、[uv](https://docs.astral.sh/uv/)、[Node.js](https://nodejs.org/) 22 以上を入れておきます。次の一行で、`noveler` コマンドと syuki が入ります。

```sh
curl -fsSL https://raw.githubusercontent.com/narusenia/agent-noveler/main/install.sh | bash
```

- 入れる途中で、Node.js・pnpm・uv・gum を何で管理するかを聞かれます。`mise` か `plain` を選びます。`plain` は、すでに入っているものをそのまま使います。
- 聞かれずに [mise](https://mise.jdx.dev) を使うときは、行の末尾を `| bash -s -- --tools mise` にします。mise は先に入れておいてください。
- 本体は `~/.local/share/agent-noveler` に、`noveler` コマンドは `~/.local/bin` に入ります。`~/.local/bin` を PATH に足してください。
- 画面の表示に使う [gum](https://github.com/charmbracelet/gum) は、noveler のフォルダに自動で入ります。システムには入りません。

## 使い方

```sh
noveler new ~/novels      # 原稿のリポジトリと、最初の作品を作る
cd ~/novels
noveler open              # 書斎で開く
noveler build             # PDF に書き出す
```

本文は `<作品>/manuscript/<巻>/<章>.kym.txt` に書きます。noveler の画面の表示は英語です。

| コマンド | すること |
| --- | --- |
| `noveler new [フォルダ]` | 原稿のリポジトリを作ります（git init、ハーネス、最初の作品）。文体パックと書き方を聞かれます。書き方は `ai`（AI が書き、自分が見る）か `human`（自分が書き、AI が見る） |
| `noveler new --layout single\|packages` | 作品の置き場所を選びます。`single`（既定。リポジトリの直下）か `packages`（`packages/<作品>/`。一つのリポジトリで複数の作品を書くとき） |
| `noveler new --flow full\|standard\|lite` | 一章ごとの見直しの段の数を選びます。`standard`（既定。見直しを一回にまとめる）、`full`（全部の段）、`lite`（段もトークンも最少）。`.agents/roles.toml` の `[mode] flow` に残ります |
| `noveler add [作品]` | 作品のフォルダを足します（syuki の台帳、PDF の設定、`manuscript/vol1/`）。題と作者名を聞かれます |
| `noveler open [フォルダ]` | 作品を書斎（shosai）で開きます。`packages/` の下の作品も見つけます |
| `noveler build [作品] [巻]` | PDF に書き出します（`--epub` で EPUB） |
| `noveler update` | noveler と syuki を最新にし、`.agents/` を入れ直します（入れ直す前に確認します） |
| `noveler doctor` | 入っている道具と版、`syuki check` の結果を表示します |
| `noveler help` | コマンドの一覧を表示します |

`-y`（`--yes`）を付けると、聞かずに既定値で進みます。

### 一つずつ入れる

| 道具 | 入れ方 |
| --- | --- |
| shosai | `npx @narusenia/shosai ~/novels`（作品のフォルダが並んだフォルダを渡す） |
| syuki | `uv tool install "syuki[ja] @ git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki"`（入れずに試すなら `uvx --from "git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki" syuki check`） |

npx で起動した書斎は、PATH の `syuki` を呼んで台帳を表示します。syuki が無くても、本文を読む、赤を入れる、組版を見る、はそのまま使えます。

## ハーネスの効き目（before / after）

見本作品の第二章を、同じモデル（Gemini）に二通りに書かせました。before は、資料とあらすじを渡して一度で書かせたものです。after は、ハーネスの流れ（カード → 編集の目 → 執筆と壁打ち → 批評と癖の検査 → 直し）を通したものです。どちらが after かを伏せて、初見の読者二人（Claude）に読ませました。

| | before | after |
| --- | --- | --- |
| 続きを読みたい度（1〜5、二人の平均） | 3.0 | 4.0 |
| 第一章からのつながり（1〜5） | 3.0 | 4.5 |
| 読み続けたい版に選んだ人数 | 0 | 2 |
| 文長のばらつき（目安 0.45 以上） | 0.37 | 0.50 |
| 語り手の声がある地の文（目安 30% 以上） | 9% | 30% 以上 |

同じ出来事を書いた所を、二つ並べます。

**1. 主人公が、十年だれにも信じてもらえなかった「白い船を見た」話を打ち明ける**

before — 気持ちを地の文で説明しています。

> 「はい。灯台の下から、白い船を」
>
> 　言った瞬間、また笑われるかもしれないと思った。小学生のころに味わった居心地の悪さがよみがえる。けれど、おばあちゃんは笑わなかった。

after — 説明せず、時間と体の感覚で見せています。

> 「……拾って三日あとの霧の朝に、白い船を見ました。灯台の下を通っていくのを」
>
> 　言ってしまった。ハルの顔が見られず、視線を自分の手元に落とす。一秒、二秒。鍵の角が手のひらに食いこむ。笑うなら今だ。「またまた」とか「見間違いだろ」とか、そういう声が飛んでくるはずなのに。

**2. 章の最後の一文**

before — 「何かが動く気がした」という決まった言い方で閉じています。

> 　少しだけ照れたように目をそらすハルを見て、俺はポケットの中の鍵をもう一度握り直した。三日後、あの霧の中で、今度こそ何かが動く気がした。

after — 物の手触りと、すぐには答えられない迷いで閉じています。

> 　三日後は平日だ。また朝から学校を抜けて岬へ向かうのか。背中の鞄の底で、白紙のまま折った進路の紙がかさりと鳴った気がして、俺はすぐには返事ができなかった。

一章を一回比べただけで、読者と批評役は Claude です。手間も after のほうがずっと多くかかっています。条件、全文、各段の報告、読者の答えは [docs/showcase/](docs/showcase/README.md) に置いています。

## 見本で試す

このリポジトリを手元に置けば、見本作品で書斎と syuki を試せます。必要なもの: [uv](https://docs.astral.sh/uv/)、Node.js 22、pnpm 11。

```sh
git clone https://github.com/narusenia/agent-noveler
cd agent-noveler
pnpm install
pnpm review        # 書斎が http://localhost:13002 で開き、見本作品が本棚に並ぶ
pnpm syuki check --work examples/sample-work   # 台帳と本文を照らす（違反 0 件）
```

自分の原稿を開くときは、作品のフォルダが並んだフォルダを `SHOSAI_WORKS` で渡します。

```sh
SHOSAI_WORKS=~/novels pnpm review
```

作品のフォルダの形は `examples/sample-work/` と同じです。`manuscript/<巻>/<章>.kym.txt` に本文を置き、syuki を使うなら `syuki.yml` と `ledger/` を置きます。雛形は `syuki init <作品のフォルダ>` で作れます。

## PDF・EPUB に書き出す

本の形への書き出しは [Vivliostyle](https://vivliostyle.org/ja/) で行います。書斎の組版の見た目と同じ `book.config.js` を読むので、画面で確かめた組みがそのまま PDF になります。`noveler add` で足した作品には書き出しの設定が入っているので、`noveler build` で書き出せます。

見本作品では、次のコマンドで書き出せます。

```sh
cd examples/sample-work
pnpm build                  # sample-work_vol1.pdf
pnpm build:epub             # sample-work_vol1.epub
VOL=vol2 pnpm build         # 巻を選ぶ（既定は vol1）
```

`pnpm build` は、まず [kakuyomu-vfm](https://www.npmjs.com/package/@narusenia/kakuyomu-vfm) で `.kym.txt` を Markdown（`.kym.md`）に変え、次に `vivliostyle build` で組みます。

## エージェントの道具（harness）

`noveler new` で作った原稿のリポジトリには入っています。noveler を使わずに入れるときは、このリポジトリから次のように実行します。

```sh
bash harness/scripts/install.sh ~/novels [文体パック]   # 文体パックを省くと general
```

`~/novels/.agents/` にハーネスが写り、各ツールが読む場所からリンクが張られます。`AGENTS.md` が無ければ雛形も置かれるので、【】の所を書き換えてください。

| ツール | 読むもの |
| --- | --- |
| Claude Code | `.claude/agents`・`.claude/skills`・`.claude/rules` と `CLAUDE.md`（どれも `.agents/` と `AGENTS.md` へのリンク） |
| Codex | `AGENTS.md` と `.agents/skills/` |
| pi | `AGENTS.md` と `.agents/skills/` |
| OpenCode | `AGENTS.md`、`.agents/skills/`、`.opencode/agents`（リンク）。決まりは `opencode.json` の `instructions` に書く |
| Antigravity（agy） | `GEMINI.md`（リンク）と `.agents/` |

役ごとに誰に頼むか（Claude のサブエージェント、herdr のペインの agy、OpenCode など）とモデルは、`.agents/roles.toml` で決めます。既定はすべて Claude Code のサブエージェントです。ほかのツールを使う例は、`roles.toml` の末尾に注釈で書いてあります。

`agy -p`（print モード）は、ほかのエージェントやスクリプトから呼ぶと利用規約に触れることがあります。既定では、どの道具も呼びません。規約を自分で確かめたうえで使う場合だけ、`roles.toml` の `[agy] allow_print` を `true` にしてください。

### 添削モード

AI に書かせず、自分で書いた本文を見てもらうだけにもできます。`roles.toml` の `[mode] write` を `"human"` にすると、本文を書く役（writer・planner）は使われず、見る役は本文を書き換えません。校正の直しは書斎の指摘ファイルに赤として積まれるので、書斎で一つずつ採るか決め、「適用」で本文に入れます。

### 文体パック

役の手順書（核）はジャンルを問わない言い方で書いてあり、ジャンルに固有の書き方と見方は文体パックに分けてあります。今あるのは、既定の **general** パック（ジャンルを問わない最小のもの）と、**light-novel** パック（ライトノベル・Web 小説向け）です。作り方は `harness/packs/README.md` にあります。

```
harness/packs/light-novel/
  pack.toml         パックの中身の一覧と、作品ごとに変えられる所
  skills/           書き方・直し方・lint（light-novel スキル）
  rules/            本文に lint と校正を当てるときの優先順位
  roles/            役ごとのジャンルの見方（核の手順書が .agents/style/roles/<役>.md として読む）
  first-read/       初見読者の人物像（ライトノベルをよく読む十代後半〜二十代）
  docs/research.md  パックの根拠にした論文と資料の調査
```

パックは `bash .agents/scripts/link-pack.sh <名前>` で `.agents/skills/` などと `.agents/style/` につなぎます（`roles.toml` の `[style] pack` も同じ名前になります）。作品ごとの調整（リズムの型、笑いとシリアスの配分、口癖の上限、残す文、会話の見本、語りの声の見本）は、パックの中を書き換えずに作品のフォルダの `style/` で行います。項目の一覧は `pack.toml` の `[customize]` にあります。

## 参考資料・論文

light-novel パックは、ライトノベルの文体研究と、LLM の文章の癖についての研究をもとに作りました。全体の一覧と、どの研究をどの決まりに使ったかは次の二つにあります。

- `harness/packs/light-novel/docs/research.md`（調査。論文と書籍 66 件と、そこから導いた対策）
- `harness/packs/light-novel/skills/light-novel/references/sources.md`（スキルが依拠する研究・道具・Web の資料）

特によく使ったものを挙げます。

- 田中弥生・加藤祥・柏野和佳子（2025）「ライトノベルと一般小説の脱文脈化の観点からの分析」『社会言語科学会 第49回大会発表論文集』pp.227-230.
- 出原健一（2023）「ライトノベルにおける二重の語り―「のだ」を中心に―」『日本認知言語学会論文集』第23巻, pp.106-117.
- 佐藤理史（2024）「小説のセリフの書き分けに使われる文末形式」『言語資源ワークショップ発表論文集』第1巻.
- 金水敏（2003）『ヴァーチャル日本語 役割語の謎』（岩波書店）
- Chakrabarty, T., Laban, P., & Wu, C.-S. (2025) "Can AI writing be salvaged?", *ACM CHI 2025*. https://arxiv.org/abs/2409.14509
- Juzek, T. S., & Ward, Z. B. (2025) "Why Does ChatGPT 'Delve' So Much? Exploring the Sources of Lexical Overrepresentation in Large Language Models", *Proceedings of COLING 2025*. https://arxiv.org/abs/2412.11385
- Xu et al. (2025) "Echoes in AI: Quantifying lack of plot diversity in LLM outputs", *PNAS*. https://arxiv.org/abs/2501.00273
- Paech et al. (2025) "Antislop", arXiv:2510.15061. https://arxiv.org/abs/2510.15061
- Zaitsu, W., & Jin, M. (2023) "Distinguishing ChatGPT(-3.5, -4)-generated and human-written papers through Japanese stylometric analysis", *PLOS ONE* 18(8), e0288453.

light-novel スキルが参考にしたほかのリポジトリとそのライセンスは、`harness/packs/light-novel/skills/light-novel/NOTICE` にあります。

## ライセンス

パッケージごとに違います。詳しくは各フォルダの `LICENSE` を見てください。

- `packages/shosai/` は AGPL-3.0 です。組版に使っている `@vivliostyle/core` が AGPL-3.0 だからです。
- それ以外（`packages/syuki/`、`harness/`、`examples/`）は MIT です。
