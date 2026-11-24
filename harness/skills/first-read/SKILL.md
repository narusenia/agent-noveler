---
name: first-read
description: 設定資料を読ませない初見読者に本文だけを読ませてレビューを取る。軽い読み（agy の gemini-3.8-flash、章を書いたり直したりするたびに使える）と、重い読み（巻が大方書き上がったときに、opencode の gemini-4-carbon とサブエージェント reader の二人に同じ束を読ませて突き合わせる）がある。分からなかった所・引っかかった所・飽きた所・続きを読みたい度を集める。「初見で読んでもらって」「初見読者レビュー」「Gemini に読ませて」と頼まれたときに使う。
---

# first-read

設定を知っている者（作者、writer、critic）には、本文で説明が抜けていても頭の中で補えてしまう。初見の読者に本文だけを読ませて、その抜けを拾う。

## 二つの読み

| 読み | 経路 | いつ | かかる時間の目安 |
|---|---|---|---|
| 軽い読み | herdr の隣のペインで動く agy の `gemini-3.8-flash-medium`（`read.sh flash`。herdr の中から呼ぶ） | 章を書いたとき・直したとき。何度回してもよい | 一章で一分ほど |
| 重い読み | opencode の `google/gemini-4-carbon`（`read.sh carbon`）と `reader` エージェント | 巻が大方書き上がったとき（全章の初稿と校正が済んでいる）、大きな改稿のあと | 巻で十数分以上 |

## 担い手

読みの相手は `.agents/roles.toml` の `[helpers.first-read-light]`（軽い読み）と `[helpers.first-read-heavy]`（重い読み）で決める。既定はどちらも `claude` で、下の手順の Gemini の代わりに `reader` エージェントに束を読ませる（重い読みの手順 1・2 のサブエージェントと同じ頼み方）。`agy`・`opencode` にしたときだけ `read.sh` を使う。

初見読者の人物像は、`[style] pack` に書いた文体パックの `first-read/prompt.md` を使う。パックに無ければ、このスキルの `prompt.md`（ジャンルを問わない読者）を使う。

## 軽い読み（章ごと）

リポジトリ直下から。初見の読者は前の章も読んでいるので、巻の頭から読む章までを束ねる。

```sh
bash .agents/skills/first-read/scripts/read.sh flash <作品>/plot/reader/<巻>-<章>-flash.md \
  <作品>/manuscript/<巻>/0[0-4]*.kym.txt   # 例: 第四章まで
```

- 返ってきた報告のうち、読んだ章の所だけを見る。前の章の感想は、前に読んだときと比べて変わった所だけ拾う。
- `read.sh` は最後に `scripts/check_quotes.py` で報告の「」『』の引用を本文と突き合わせ、本文に無い引用を報告の末尾（「引用の照合」）と標準出力に出す。「見つからない」の引用は作り話の疑いがあるので、その指摘は根拠にしない。単独では `python3 .agents/skills/first-read/scripts/check_quotes.py 報告.md 章ファイル...`。
- 引用された箇所は本文で確かめてから使う。直しが要るものは writer か作者への問いに回す。
- 報告は `plot/reader/` に置き、残すほどでなければ消してよい（コミットしなくてよい）。強さを変えるときは `FIRST_READ_FLASH_MODEL=gemini-3.8-flash-high` など。

## 重い読み（巻を通して）

リポジトリ直下から。`<作品>` と `<巻>` は依頼に合わせる。

1. 束を作る（作品のフォルダの外に置く。中に置くと reader が作品の決まりを読みこむ）:

   ```sh
   dir=$(mktemp -d "${TMPDIR:-/tmp}/first-read.XXXXXX")
   python3 .agents/skills/first-read/scripts/bundle.py "$dir" <作品>/manuscript/<巻>/*.kym.txt
   ```

2. 二人に並べて読ませる（同じ返答の中で両方を始める）:
   - Gemini: `bash .agents/skills/first-read/scripts/read.sh carbon <作品>/plot/reader/<巻>-gemini.md <作品>/manuscript/<巻>/*.kym.txt`（数分かかるのでバックグラウンドで回す。モデルを変えるときは `FIRST_READ_MODEL=google/...`）。
   - サブエージェント: `reader` エージェントに、`$dir/book.txt` のパス、初見読者の人物像（使っている文体パックの `first-read/prompt.md`。無ければ `.agents/skills/first-read/prompt.md`）の中身、出力先 `<作品>/plot/reader/<巻>-reader.md`（既存の報告と揃えるなら `<巻>-claude.md` 等）を渡す。作品の名前や設定は依頼文に書かない。
3. 二人の報告を突き合わせ、`<作品>/plot/reader/<巻>.md` にまとめる:
   - 二人とも分からなかった・引っかかった所（いちばん確か。上に置く）
   - 一人だけの所（読み手による。根拠の引用が具体的なものだけ残す）
   - 続きを読みたい度の章ごとの線と、下がった章
   - 作者が意図した謎なのに「どうでもいい」と言われたもの、意図していないのに謎として残ったもの（ここだけは plot と台帳を見て分ける。`syuki` があれば threads と secrets）
4. 直しが要るものは、筋なら critic・planner、面白さなら editor、作者の判断なら `syuki ask` の問いの案にして、作者に出す。負債になる継ぎ当てより、場面の組み直しや設定の変更を優先する。

## 決まり

- 二人には本文以外を渡さない。依頼文やプロンプトに、設定、あらすじ、作者の意図、前の批評を書かない。
- Gemini に送るのは本文の束だけ（フロントマターは外す）。作者の名前や設定資料は送らない。
- 二人の報告は読み手の感想なので、本文の直しの根拠にするときは、引用された箇所を本文で確かめる。
- 重い読みの報告ファイル（`plot/reader/`）はコミットしてよい。
- どちらの経路も、束を入れた空の一時フォルダで動かす（agy は `--sandbox`）。作品のフォルダで直接 opencode や agy を起動しない。
- 軽い読みは agy -p を使わず、herdr のペインで対話の agy を動かす。メインの会話が herdr の外にいるときは、作者に herdr の中で起動し直してもらう。読み終えたペインはスクリプトが閉じる。
- `agy` のサンドボックス内から `read.sh` を呼んで `operation not permitted` になるときは、サンドボックス外での実行に切り替える。
