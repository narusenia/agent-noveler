# before / after: ハーネスを通すと何が変わるか

見本作品「灯台の鍵」の第二章を、同じモデル（Gemini、Antigravityの対話）に二通りに書かせて比べた。

- **before**: 資料とあらすじを渡し、一度で書かせた。
- **after**: 同じ資料とあらすじから、このリポジトリのハーネスの流れ（カード → 編集の目 → 執筆と壁打ち → 批評と癖の検査 → 直し）で書かせた。

## 条件

- 題材: `brief.md`の三場面のあらすじ（2,000〜2,500字）。序章と第一章は`examples/sample-work`のもの。
- 書き手: どちらもGemini 4 Hydrogen（Antigravity CLIの対話。`agy -p`は使っていない）。作者は途中で答えない決まりにし、問いが出たらモデル自身に決めさせた。
- beforeの依頼: `before/prompt.md`の一文だけ。プロット、人物、設定、序章と第一章を読ませた。
- afterの流れ（依頼文は`after/prompts/`）:
  1. plannerがカードを書く（`after/card.md`）。
  2. editor（Claude）がカードを見る（`after/reviews/editor-card.md`）。
  3. plannerが指摘をカードに入れる。
  4. writerが本文を書く。場面ごとにspar（Claude Sonnet）と壁打ちし、台帳に記録し、`syuki check`とlintを通す（`after/02-draft.kym.txt`）。
  5. criticとslop（どちらもClaude）が初稿を見る（`after/reviews/critic.md`、`after/reviews/slop.md`）。
  6. writerが指摘を入れて直す（`after/02.kym.txt`）。
- 作者が答える段（auditorの監査）と、最後の校正（proofreader）は回していない。

## 数字（lint）

`check_style.py`（文体パックlight-novel）で、三つの原稿を同じ設定で測った。

| | before | after初稿 | after直し後 |
| --- | --- | --- | --- |
| 字数 | 2,426 | 2,436 | 2,509 |
| 地の文の平均の文長 | 23.0字 | 25.2字 | 27.1字 |
| 文長のばらつき（変動係数） | 0.37 | 0.45 | 0.50 |
| 語り手の声がある地の文 | 9% | 26% | 30%以上 |
| lintの指摘 | 6件 | 1件 | 1件 |

文長のばらつきと語り手の声は、AIの文と人の文を分ける目安として調べたもの（`harness/packs/light-novel/docs/research.md`）。ばらつきは0.45以上、声は30%以上を目安にしている。

## 初見の読者

二人の読者（Claude）に、どちらがafterかを伏せて読ませた。答えは`readers.md`。

| | before | after |
| --- | --- | --- |
| 続きを読みたい度（1〜5、二人の平均） | 3.0 | 4.0 |
| 人物が生きて感じられたか | 3.0 | 4.0 |
| 第一章からのつながり | 3.0 | 4.5 |
| 読み続けたい版に選んだ人数 | 0 | 2 |

## 何が効いたか

- **カードの段階で直した所が、読者の評価に出た。** beforeへの読者の指摘（「刻印が偶然見つかり、鍵が役に立っていない」「祖母が説明役」「手がかりが増えない」）は、afterではeditorがカードの段階で拾い、書く前に直していた。
- **批評が、日取りと証言の食い違いを拾った。** beforeには「昨日」が第一章の日取りと合わない所と、鍵を拾った日と船を見た日を取り違える所が残った。afterではcriticが同じ種類の食い違いを拾い、writerが直した。
- **癖の検査が、文の均一さを崩した。** slopの指摘（後半で語り手の声が消える、「俺は」の出しすぎ、言い直し）を入れて、文長のばらつきと声の割合が目安を超えた。

## 限り

- 一章、一回だけの比較で、書き手のモデルは一つ。
- 読者も、afterの流れで批評したeditor・critic・slopもClaudeで、同じ系統のモデルが作った物差しと読み手になっている。
- afterはbeforeより手間（依頼の回数、時間、APIの利用）がずっと多い。手間を同じにした比較ではない。
- afterの読者からも、冒頭で経緯をまとめて説明する段落が重い、地の文が一か所だけ独り言の口調になる、という指摘が出ている。ハーネスを通しても、粗は残る。

## ファイル

| ファイル | 中身 |
| --- | --- |
| `brief.md` | 両方に渡したあらすじ |
| `before/prompt.md`、`before/02.kym.txt` | beforeの依頼と原稿 |
| `after/prompts/` | afterの各段の依頼 |
| `after/card.md` | plannerのカード（editorの指摘を入れたあと） |
| `after/reviews/` | editor・critic・slopの報告 |
| `after/02-draft.kym.txt`、`after/02.kym.txt` | afterの初稿と直し後 |
| `readers.md` | 初見の読者二人の答え |
