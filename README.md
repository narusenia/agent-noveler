# agent-noveler

Tools for writing Japanese novels with AI agents: **syuki** (a CLI that keeps a story ledger and checks manuscripts against it), **shosai** (a vertical-text viewer for red-pen review and typesetting), and an **agent harness** (role definitions, rules and skills for Claude Code, Codex, pi, OpenCode and Antigravity). Genre-specific know-how lives in swappable style packs; the first one is for light novels.

---

AI と一緒に日本語の小説を書くための道具一式です。原稿そのものは入っていません。試すための短い見本作品だけを同梱しています。

| フォルダ | 中身 | ライセンス |
| --- | --- | --- |
| `packages/syuki/` | 台帳 CLI。人物が何を知っているか、持ち物がどこにあるかなどを YAML の台帳に記録し、場面ごとに引き出したり、本文と照らして矛盾を見つけたりする | MIT |
| `packages/shosai/` | 書斎ビューア。縦書きで原稿を読み、赤を入れ、組版の見た目で確かめる。syuki の台帳も横に出せる | AGPL-3.0 |
| `harness/` | エージェントの道具。役（書く、校正する、批評するなど）の手順書、決まり、スキル、役ごとの担い手を決める仕組み、文体パック | MIT |
| `examples/sample-work/` | 見本作品「灯台の鍵」（序章と第一章）。syuki と shosai がそのまま動く | MIT |

## 入れ方

先に [git](https://git-scm.com/downloads)、[uv](https://docs.astral.sh/uv/)、[Node.js](https://nodejs.org/) 22 以上を入れておきます。次の一行で、`noveler` コマンドと syuki が入ります。

```sh
curl -fsSL https://raw.githubusercontent.com/narusenia/agent-noveler/main/install.sh | bash
```

- 途中で、道具（Node.js・pnpm・uv・gum）の管理を mise か plain から選びます。plain は、自分で入れた道具をそのまま使います。
- [mise](https://mise.jdx.dev) で揃えるときは、末尾を `| bash -s -- --tools mise` にすると聞かれずに進みます。mise 自体は先に入れておきます。
- 本体は `~/.local/share/agent-noveler` に入り、`noveler` は `~/.local/bin` に置かれます（`~/.local/bin` を PATH に足してください）。
- 見た目を整える [gum](https://github.com/charmbracelet/gum) は noveler のフォルダに自動で入ります。システムには入りません。

## 使い方

```sh
noveler new ~/novels      # 原稿のリポジトリを作り、最初の作品を足す
cd ~/novels
noveler open              # 書斎で開く
noveler build             # PDF に書き出す
```

本文は作品のフォルダの `manuscript/<巻>/<章>.kym.txt` に書きます。

| コマンド | すること |
| --- | --- |
| `noveler new [フォルダ]` | 原稿のリポジトリを作る。ハーネスを入れ、文体パックと書き方（AI が書く／自分で書く）を選び、最初の作品を足す |
| `noveler add [作品名]` | 作品のフォルダを足す。題と作者名を聞き、台帳と PDF の設定を置く |
| `noveler open` | 書斎（shosai）で原稿のリポジトリを開く |
| `noveler build [作品] [巻]` | PDF を作る。`--epub` で EPUB |
| `noveler update` | noveler と syuki を最新にする。`.agents/` の入れ直しは確認してから |
| `noveler doctor` | 道具の有無と版、各作品の `syuki check` の結果を表示する |
| `noveler help` | コマンドの一覧 |

`-y`（`--yes`）を付けると、聞かずに既定値で進みます。

### 道具を一つずつ入れる

| 道具 | 入れ方 |
| --- | --- |
| shosai | `npx @narusenia/shosai ~/novels`（作品のフォルダが並んだフォルダを渡す） |
| syuki | `uv tool install "syuki[ja] @ git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki"`（入れずに試すなら `uvx --from "git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki" syuki check`） |

npx で起動した書斎は、PATH の `syuki` を呼んで台帳を表示します。syuki が無くても、本文を読む、赤を入れる、組版を見る、はそのまま使えます。

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
bash harness/scripts/install.sh ~/novels [文体パック]   # 文体パックを省くと light-novel
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

ジャンルに固有の書き方と見方は、文体パックとして核から分けてあります。今あるのは **light-novel** パックだけです。

```
harness/packs/light-novel/
  pack.toml         パックの中身の一覧と、作品ごとに変えられる所
  skills/           書き方・直し方・lint（light-novel スキル）
  rules/            本文に lint と校正を当てるときの優先順位
  agents/           パックが足す役（slop: AI 文の癖を見る）
  first-read/       初見読者の人物像（ライトノベルをよく読む十代後半〜二十代）
  docs/research.md  パックの根拠にした論文と資料の調査
```

パックは `bash .agents/scripts/link-pack.sh <名前>` で `.agents/skills/` などにつなぎ、`roles.toml` の `[style] pack` に名前を書きます。作品ごとの調整（リズムの型、笑いとシリアスの配分、口癖の上限、残す文、会話の見本、語りの声の見本）は、パックの中を書き換えずに作品のフォルダの `style/` で行います。項目の一覧は `pack.toml` の `[customize]` にあります。

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

- `packages/shosai/` は AGPL-3.0。組版に使っている `@vivliostyle/core` が AGPL-3.0 だからです。
- それ以外（`packages/syuki/`、`harness/`、`examples/`）は MIT。
