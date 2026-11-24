# syuki の台帳の書き方

台帳の正本は `ledger/` の YAML。人が読む Markdown（人物・設定・地図・文書・状態表）は `syuki render` が作る生成物で、手で直さない。形は `syuki check` が確かめる（知らない項目、型の違い、必須の項目の抜けは違反）。

## 共通の書き方

- **時点**: `"章:場面"`（例 `"04:3"`）。章は本文のファイル名から拡張子を外したもの（`04`、`00-prologue`）か、`-` で区切った一部（`00`、`prologue`）。場面は本文の場面転換（`＊` だけの行）で区切って 1 から数える。`"04"` は章の頭。巻が二つ以上あれば `"vol2/04:3"`。
- **引用**: `章「本文の字」`（例 `01「髪が風に揺れた」`）。行番号は書かない。syuki がその時の本文から行を引き直す。ルビ・傍点の記法と空白を外した本文でも探すので、引用はルビなしで書いてよい。本文から消えたら「迷子」の違反になる。引用を書く項目は `src`・`explained`・`cites`・`phrases`・`lines` だけ。
- **名前**: 人物は `characters.yaml` の `name`・`short`・`aliases` のどれでも指せる。出来事と場面の表では `short`（無ければ `name`）を使うと読みやすい。持ち物・場所も `name` か `aliases`。
- **決まった値は英語**: `kind`・`do`・`reader`・`status` など、syuki が決めた値は英語で書く（下の各節）。人が読む出力（render の Markdown、brief など）では日本語の言い方で出る。
- YAML の注意: 時点と時刻は `"04:3"`・`"17:00"` のように引用符で囲むのが安全（syuki は囲まなくても文字として読む）。一行の `{…}` の書き方では、値に半角の `,` を入れない。

## syuki.yml（作品のフォルダに一つ）

```yaml
manuscript: manuscript        # 本文のフォルダ。巻ごとの下のフォルダに章のファイル
ext: .kym.txt                 # 章のファイルの拡張子
volumes: [vol1]               # 巻の順
ledger: ledger
style: style/profile.toml     # lint に --profile で渡す。視点（[pov]）は知識の照合も使う
plots: {vol1: plot/vol1.md}   # 場面カードの Markdown
setting: [docs/setting.md]    # 検索と未登録語の照合に使う Markdown
stages:                       # 好意の段階（作品の plot から写す）
  ハル: [幼なじみ, 気になる, 支えられる, 自覚, 素直になれない]
render:                       # 生成物の置き場所（{vol} は巻）
  characters: characters.md
  details: details.md
  map: plot/map.md
  documents: plot/documents.md
  state: plot/{vol}-state.md
```

場面カードは、見出しに章のファイル名を `` `04.kym.txt` `` の形で含む節の、番号付きの項目（`3.`）を場面 3 として読む。番号の項目が無い節（序章）は節全体が場面 1 のカード。カードの下に字下げした行（`   - 動機: …`）もカードに入る。

## ledger/characters.yaml

```yaml
- name: ハル・ミナト
  short: ハル                      # 出来事で使う呼び名
  aliases: [委員長]
  role: 端役                       # 見出しの（）に出る。任意
  profile:                         # 「- 項目: 中身」の行になる。値は文字・並び・項目のどれでも
    一人称: 私
    語尾: 「〜の」「〜よ」
  catchphrases: [知ってる, たぶん]   # 生成物に「- 口癖: 「…」「…」」の行で出す（check_style が読む）
  samples: {平常: 「…」, 照れたとき: 「…」}
  lines: [01「知ってる。だから来たの」]  # 決め台詞。本文に残っているかを照合する
  notes:                           # 本文で足した事実。ラベルは文の頭に【本文確定】【本文仮】【秘匿】
    - 【本文仮】祖母に潮読みを習った（第1巻第一章）。
```

## ledger/world.yaml

```yaml
sections:                 # details.md の節。節の名前 → 文の並び
  町と海:
    - 【本文仮】漁師の家では、霧の日は漁が休みになる（第1巻第一章）。
incidents:                # 事件表
  - {at: "02:5", day: 五日目の夜, what: 集会所から帳面が一冊消える, record: 掲示なし}
```

## ledger/terms.yaml

```yaml
- term: 潮読み
  reading: しおよみ
  explained: 01「潮の満ち方と風の向きで」   # 説明した所。ここより前に使うと違反
  note: 場面1、ハルの台詞
- term: 霧笛
  basic: true             # 一章に一つの決まりができる前からの語。新しい用語に数えない
- term: 灯り番
  hidden_until: "06"      # この時点より前に使うと違反（章がまだ無ければ、どこで使っても違反）
```

## ledger/places.yaml

```yaml
places:
  - name: 岬の灯台
    aliases: [灯台]
    in: 港町              # 任意
    where: 港町の西、岬の坂の上
    looks: 白い塔。いちばん下の窓は板でふさいである
    src: [00「港町の西、岬の坂の上」]
    notes: [地下に扉が一つ]   # 間取りなどの細部
routes:
  - {from: ソラの家, to: 岬の灯台, via: 桟橋 → 岬の坂, time: 歩いて二十分, minutes: 20}
```

`minutes` があれば、同じ日の続いた場面の時刻の差と比べる（足りなければ違反）。

## ledger/items.yaml

```yaml
- name: 古い鍵
  aliases: [鍵]
  desc: 錆の浮いた、指ほどの長さの鍵。持ち手に波の模様が三本
  holder: ソラ            # はじめの持ち主（人物か場所）
  notes: [由来は【秘匿】]
```

## ledger/secrets.yaml

```yaml
- id: 地下の扉
  fact: 古い鍵は灯台の地下の扉を開ける
  reader: hinted          # 読者への開き方。disclosed（開示）・hinted（示唆）・hidden（【秘匿】）
  reader_note: （第一章）。扉の先は【秘匿】   # 任意。reader の補足。表示では reader の言い方のすぐあとにつなぐ
  markers: [地下の扉]     # 目印の語。知る前の人物の台詞・語りに出たら「確認」
  known: [灯台守]         # はじめから知っている人
  note: 回収は第五章
```

## ledger/threads.yaml（伏線）

```yaml
- id: 波の模様
  desc: 鍵の持ち手の模様が、ハルの祖母の家の戸にもある
  plan:
    - {at: "vol2/03", do: payoff, note: 祖母の家の戸}   # do は hint（匂わせる）・payoff（回収）。payoff の時点が本文に来て記録が無ければ違反
  phrases: [01「同じ模様があるよ」]  # 伏線の文言。本文に残っているかを照合する
```

## ledger/documents.yaml

```yaml
- id: 灯台守の手紙1
  title: 灯台守の手紙（一通目）
  aliases: [じいさんの手紙]
  author: 灯台守
  holder: ソラ
  text: |                 # 正本。本文の記法（ルビ・傍点）のまま書いてよい
    『ソラへ
    　霧の日に、地下の扉を見ろ。
    　灯台守』
  cites: [03「霧の日に、地下の扉を見ろ。」]
  notes: [茶色い封筒、切手なし]
```

`cites` の行の『』の中（『が無い行は行全体）が、記法と空白を外した正本に一字一句含まれるかを照合する。

## ledger/questions.yaml（syuki ask が書く）

```yaml
- {id: Q-001, q: 白い船の正体を第二章で明かすか, at: "01:5", status: open, asked: "2026-01-01"}
```

`status` は open か settled。決着すると `answer` と `settled` が付く。`syuki ask` で書き直すとコメントは消える。

## ledger/<巻>/scenes.yaml（場面の表）

```yaml
- {at: "01:4", day: 2, time: 午前, place: 岬の灯台, cast: [ソラ, 灯台守], summary: 灯台守が地下の扉のことを言う}
```

- `day` は作中の日（整数。一日目＝1）。`time` は `"HH:MM"` か 夜明け・日の出・朝・午前・昼前・昼・昼休み・昼すぎ・午後・放課後・夕方・日暮れ・晩・夜・夜中。それ以外の言い方は日の順だけを見る。
- 本文の場面ごとに一行。本文の場面の数と合わなければ違反。表に無い章は「確認」。
- `card: 2` でカードの番号を場面の番号と別にできる。
- 人物の居場所は、出ている最後の場面の `place` から出す。

## ledger/<巻>/events.yaml（出来事の記録）

時点の順に並べる（`syuki add` は順を保って入れる）。

| kind | 意味 | 項目 |
| --- | --- | --- |
| know（知る） | 人物が事実を知る。`what` が secrets の `id` なら秘密として数える | who, what |
| feel（気持ち） | 人物の相手への気持ちが変わる（相手ごとに最新が残る） | who, to, what |
| move（移る） | 持ち物が移る。`from` を書けば、その時の持ち主と合うかを照合 | what（持ち物）, to（人物か場所）, from |
| plant・hint・payoff（置く・匂わせる・回収） | 伏線 | what（threads の `id`） |
| stage（段階） | 好意の段階が進む | who（stages の人物）, what（段階） |

どれにも `src`（引用）と `note` を付けられる。`who` は一人なら文字、二人以上なら並び。

```yaml
- {at: "01:4", kind: know, who: ソラ, what: 地下の扉, src: 01「ここの地下の扉を見てみろ」}
- {at: "03:2", kind: move, what: 灯台守の手紙1, from: 灯台守, to: ソラ}
- {at: "01:5", kind: stage, who: ハル, what: 気になる}
```

状態は時点の場面の頭まで（その場面の出来事は入れない）の記録を積み上げて出す。照合（知らないはずの知識）では、その場面の終わりまでを入れる。

## ledger/<巻>/notes/<章>.md（筋道メモ）

writer が書く。`## 3` の節があれば `syuki brief 04:3` はその節だけを出し、無ければ全体を出す。

## ledger/checks.py（任意、作品だけの照合）

```python
def check(work, report):
    # work: syuki.work.Work（chapters・scenes・events・led など）
    report.add("my_check", "中身", where="manuscript/vol1/04.kym.txt:12", confirm=False)  # confirm=True で「確認」
```

種類（第一引数）は英語の短い名前にする。`syuki check --json` の `level` は violation（違反）か confirm（確認）、`kind` は lost_anchor・unknown_name などの英語の名前。
