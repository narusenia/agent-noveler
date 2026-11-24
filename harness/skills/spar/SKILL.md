---
name: spar
description: writer が書きながら壁打ちする相手。ふだんは claude -p の sonnet で、章のあいだ同じ相手と往復し、書く前の筋道メモと書いた直後の場面に、つながり・知識のずれ・なんで？・面白さの引っかかりを三つまで返させる。writer が章を書く・大きく改稿するときに使う。重い批評は critic、答えの監査は auditor の担当。
---

# spar

writer はサブエージェントなので、書いている途中で critic などを呼べない。代わりに、外の軽いモデルとの会話を章ごとに一つ持ち、コマンド実行で往復する。

## 経路（基本は claude）

書く側と同じモデルと壁打ちすると、引っかかりを見落としやすい。writer を agy（Gemini）などに任せているなら、既定の Claude がそのまま別の目になる。writer も Claude なら、経路を `carbon` にするか、`SPAR_MODEL` で別のモデルを選ぶ。

| 経路 | モデル | 使う所 |
|---|---|---|
| `claude`（既定） | `claude -p` の `sonnet`（ツールなし） | ふだんの壁打ち全部 |
| `carbon` | opencode の `google/gemini-4-carbon` | 別の名前で始める（例: `SPAR_ROUTE=carbon bash $s start mywork-vol1-05-hard -`） |

- `ask` は `start` のときの経路を引き継ぐ。

## 使い方

作品のフォルダで呼ぶ。名前は章ごとに一つ（例: `mywork-vol1-05`）。材料はファイルか標準入力（`-`）で渡す。

```sh
s=.agents/skills/spar/scripts/spar.sh
# 書く前: 場面の頭の状態とカード、筋道メモを渡して会話を始める
{ syuki brief 05:1; cat ledger/vol1/notes/05.md; } | bash $s start mywork-vol1-05 -
# 場面を書いた直後: 書いた場面を送る（次の場面の brief も一緒に送ってよい）
sed -n '<場面の行>p' manuscript/vol1/05.kym.txt | bash $s ask mywork-vol1-05 -
```

- `start` を同じ名前で呼ぶと、新しい会話で始め直す。
- 返事は「どこ／何が引っかかるか／直す方向」を重い順に三つまで。なければ「なし」。
- `start` のとき、今いる作品のフォルダ（`SPAR_WORK` で変えられる）の `style/samples/` の見本を一緒に送る（`*.txt` と、【候補】の外れた `contrast.md`。一つにつき頭から `SPAR_SAMPLE_LINES` 行、既定 80）。
- 書いた場面には、それとは別に「見本と温度が違う段落」を三つと、寄せる見本を返す（定型の問いは `role.md`。`start` のとき最初に送られる）。
- モデルは `SPAR_MODEL` で変えられる（claude なら `opus` など）。一往復は数秒〜数十秒。

## 決まり

- 相手に渡すのは、syuki の brief・カード・筋道メモ・書いた本文だけ。相手は作品のフォルダの外で動き、設定資料を自分では読まない。秘匿の中身は、brief の「知らない秘密」の名前以上には渡さない。
- 返事は相手の意見。直すかどうかは writer が決める。直さなかった指摘は、理由を一行で writer の報告に書く。
- 相手の言う直し方の方向は、作品の決まり（AGENTS.md、keep.md、作者の決定）より下に置く。決まりとぶつかる指摘は採らない。
- `agy` の経路（`agy -p`）は、`.agents/roles.toml` の `[agy] allow_print = true` のときだけ使える。spar は書いている agy から呼ばれることがあり、そこから `agy -p` を呼ぶと利用規約に触れることがある。既定では使わない。
