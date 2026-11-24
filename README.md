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

## Install

You need [git](https://git-scm.com/downloads), [uv](https://docs.astral.sh/uv/) and [Node.js](https://nodejs.org/) 22 or later. This line installs the `noveler` command and syuki:

```sh
curl -fsSL https://raw.githubusercontent.com/narusenia/agent-noveler/main/install.sh | bash
```

- The installer asks which tool manager to use for Node.js, pnpm, uv and gum: `mise` or `plain`. `plain` uses the tools you have already installed.
- To use [mise](https://mise.jdx.dev) without being asked, end the line with `| bash -s -- --tools mise`. Install mise itself first.
- The files go into `~/.local/share/agent-noveler`, and the `noveler` command into `~/.local/bin`. Add `~/.local/bin` to your PATH.
- [gum](https://github.com/charmbracelet/gum), used for the prompts, is installed into the noveler folder automatically, not system-wide.

## Usage

```sh
noveler new ~/novels      # create a manuscript repository and its first work
cd ~/novels
noveler open              # open the works in shosai
noveler build             # build a PDF
```

Write each chapter in `<work>/manuscript/<volume>/<chapter>.kym.txt`.

| Command | Description |
| --- | --- |
| `noveler new [folder]` | Create a manuscript repository (git init, harness, first work). Asks for a style pack and a writing mode: `ai` (AI writes, you review) or `human` (you write, AI reviews) |
| `noveler new --layout single\|packages` | Choose where works live: `single` (default, works at the repo root) or `packages` (works under `packages/<work>/`, for several works in one repo) |
| `noveler add [work]` | Add a work folder (syuki ledger, PDF config, `manuscript/vol1/`). Asks for the title and author |
| `noveler open [folder]` | Open the works in the reading desk (shosai). Works under `packages/` are found too |
| `noveler build [work] [vol]` | Build a PDF (`--epub` for EPUB) |
| `noveler update` | Update noveler and syuki, then reinstall `.agents/` (asks first) |
| `noveler doctor` | Show installed tools and versions, and syuki check results |
| `noveler help` | Show the command list |

`-y` (`--yes`) uses the defaults without asking.

### Install the components one by one

| Component | Command |
| --- | --- |
| shosai | `npx @narusenia/shosai ~/novels` (pass the folder that holds your works) |
| syuki | `uv tool install "syuki[ja] @ git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki"` (to try it without installing: `uvx --from "git+https://github.com/narusenia/agent-noveler#subdirectory=packages/syuki" syuki check`) |

shosai started with npx calls `syuki` on your PATH to show the ledger. Without syuki you can still read, mark up and preview the typesetting.

## ハーネスの効き目（before / after）

見本作品の第二章を、同じモデル（Gemini）に二通りに書かせた。before は資料とあらすじを渡して一度で書かせたもの、after はハーネスの流れ（カード → 編集の目 → 執筆と壁打ち → 批評と癖の検査 → 直し）を通したもの。どちらが after かを伏せて、初見の読者二人（Claude）に読ませた。

| | before | after |
| --- | --- | --- |
| 続きを読みたい度（1〜5、二人の平均） | 3.0 | 4.0 |
| 第一章からのつながり（1〜5） | 3.0 | 4.5 |
| 読み続けたい版に選んだ人数 | 0 | 2 |
| 文長のばらつき（目安 0.45 以上） | 0.37 | 0.50 |
| 語り手の声がある地の文（目安 30% 以上） | 9% | 30% 以上 |

同じ出来事を書いた所を、二つ並べる。

**1. 主人公が、十年だれにも信じてもらえなかった「白い船を見た」話を打ち明ける**

before — 気持ちを地の文が説明している。

> 「はい。灯台の下から、白い船を」
>
> 　言った瞬間、また笑われるかもしれないと思った。小学生のころに味わった居心地の悪さがよみがえる。けれど、おばあちゃんは笑わなかった。

after — 説明せず、時間と体の感覚で見せている。

> 「……拾って三日あとの霧の朝に、白い船を見ました。灯台の下を通っていくのを」
>
> 　言ってしまった。ハルの顔が見られず、視線を自分の手元に落とす。一秒、二秒。鍵の角が手のひらに食いこむ。笑うなら今だ。「またまた」とか「見間違いだろ」とか、そういう声が飛んでくるはずなのに。

**2. 章の最後の一文**

before — 「何かが動く気がした」という決まった言い方で閉じている。

> 　少しだけ照れたように目をそらすハルを見て、俺はポケットの中の鍵をもう一度握り直した。三日後、あの霧の中で、今度こそ何かが動く気がした。

after — 物の手触りと、すぐには答えられない迷いで閉じている。

> 　三日後は平日だ。また朝から学校を抜けて岬へ向かうのか。背中の鞄の底で、白紙のまま折った進路の紙がかさりと鳴った気がして、俺はすぐには返事ができなかった。

一章、一回だけの比較で、読者と批評役は Claude、手間も after のほうがずっと多い。条件、全文、各段の報告、読者の答えは [docs/showcase/](docs/showcase/README.md) に置いている。

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

役の手順書（核）はジャンルを問わない言い方で書いてあり、ジャンルに固有の書き方と見方は文体パックに分けてあります。今あるのは **light-novel** パックと、核だけで動くことを示す最小の **general** パックです。作り方は `harness/packs/README.md`。

```
harness/packs/light-novel/
  pack.toml         パックの中身の一覧と、作品ごとに変えられる所
  skills/           書き方・直し方・lint（light-novel スキル）
  rules/            本文に lint と校正を当てるときの優先順位
  roles/            役ごとのジャンルの見方（核の手順書が .agents/style/roles/<役>.md として読む）
  agents/           パックが足す役（slop: AI 文の癖を見る）
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

- `packages/shosai/` は AGPL-3.0。組版に使っている `@vivliostyle/core` が AGPL-3.0 だからです。
- それ以外（`packages/syuki/`、`harness/`、`examples/`）は MIT。
