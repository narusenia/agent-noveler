# before / after: ハーネスを通すと何が変わるか

見本作品「灯台の鍵」の第二章を、同じモデル（Gemini、Antigravity の対話）に二通りに書かせて比べた。

- **before**: 資料とあらすじを渡し、一度で書かせた。
- **after**: 同じ資料とあらすじから、このリポジトリのハーネスの流れ（カード → 編集の目 → 執筆と壁打ち → 批評と癖の検査 → 直し）で書かせた。

## 条件

- 題材: `brief.md` の三場面のあらすじ（2,000〜2,500 字）。序章と第一章は `examples/sample-work` のもの。
- 書き手: どちらも Gemini 4 Hydrogen（Antigravity CLI の対話。`agy -p` は使っていない）。作者は途中で答えない決まりにし、問いが出たらモデル自身に決めさせた。
- before の依頼: `before/prompt.md` の一文だけ。プロット、人物、設定、序章と第一章を読ませた。
- after の流れ（依頼文は `after/prompts/`）:
  1. planner がカードを書く（`after/card.md`）。
  2. editor（Claude）がカードを見る（`after/reviews/editor-card.md`）。
  3. planner が指摘をカードに入れる。
  4. writer が本文を書く。場面ごとに spar（Claude Sonnet）と壁打ちし、台帳に記録し、`syuki check` と lint を通す（`after/02-draft.kym.txt`）。
  5. critic と slop（どちらも Claude）が初稿を見る（`after/reviews/critic.md`、`after/reviews/slop.md`）。
  6. writer が指摘を入れて直す（`after/02.kym.txt`）。
- 作者が答える段（auditor の監査）と、最後の校正（proofreader）は回していない。

## 数字（lint）

`check_style.py`（文体パック light-novel）で、三つの原稿を同じ設定で測った。

| | before | after 初稿 | after 直し後 |
| --- | --- | --- | --- |
| 字数 | 2,426 | 2,436 | 2,509 |
| 地の文の平均の文長 | 23.0 字 | 25.2 字 | 27.1 字 |
| 文長のばらつき（変動係数） | 0.37 | 0.45 | 0.50 |
| 語り手の声がある地の文 | 9% | 26% | 30% 以上 |
| lint の指摘 | 6 件 | 1 件 | 1 件 |

文長のばらつきと語り手の声は、AI の文と人の文を分ける目安として調べたもの（`harness/packs/light-novel/docs/research.md`）。ばらつきは 0.45 以上、声は 30% 以上を目安にしている。

## 初見の読者

二人の読者（Claude）に、どちらが after かを伏せて読ませた。答えは `readers.md`。

| | before | after |
| --- | --- | --- |
| 続きを読みたい度（1〜5、二人の平均） | 3.0 | 4.0 |
| 人物が生きて感じられたか | 3.0 | 4.0 |
| 第一章からのつながり | 3.0 | 4.5 |
| 読み続けたい版に選んだ人数 | 0 | 2 |

## 何が効いたか

- **カードの段階で直した所が、読者の評価に出た。** before への読者の指摘（「刻印が偶然見つかり、鍵が役に立っていない」「祖母が説明役」「手がかりが増えない」）は、after では editor がカードの段階で拾い、書く前に直していた。
- **批評が、日取りと証言の食い違いを拾った。** before には「昨日」が第一章の日取りと合わない所と、鍵を拾った日と船を見た日を取り違える所が残った。after では critic が同じ種類の食い違いを拾い、writer が直した。
- **癖の検査が、文の均一さを崩した。** slop の指摘（後半で語り手の声が消える、「俺は」の出しすぎ、言い直し）を入れて、文長のばらつきと声の割合が目安を超えた。

## 限り

- 一章、一回だけの比較で、書き手のモデルは一つ。
- 読者も、after の流れで批評した editor・critic・slop も Claude で、同じ系統のモデルが作った物差しと読み手になっている。
- after は before より手間（依頼の回数、時間、API の利用）がずっと多い。手間を同じにした比較ではない。
- after の読者からも、冒頭で経緯をまとめて説明する段落が重い、地の文が一か所だけ独り言の口調になる、という指摘が出ている。ハーネスを通しても、粗は残る。

## ファイル

| ファイル | 中身 |
| --- | --- |
| `brief.md` | 両方に渡したあらすじ |
| `before/prompt.md`、`before/02.kym.txt` | before の依頼と原稿 |
| `after/prompts/` | after の各段の依頼 |
| `after/card.md` | planner のカード（editor の指摘を入れたあと） |
| `after/reviews/` | editor・critic・slop の報告 |
| `after/02-draft.kym.txt`、`after/02.kym.txt` | after の初稿と直し後 |
| `readers.md` | 初見の読者二人の答え |
