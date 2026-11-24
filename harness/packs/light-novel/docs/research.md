# ライトノベル文体・AIの癖のある表現・LLMがライトノベル風に書けない理由に関する調査

調査日: 2026-11-13

本資料は、以下の3点を目的として学術論文・学会発表・プレプリントおよび本リポジトリ内の既存参照資料を整理した調査報告である。

1. **ライトノベル（Web小説含む）に関する学術論文の整理**
2. **AIの癖のある表現（AI-isms / AI slop / 日本語AI文体）に関する研究の整理**
3. **「現在のLLMがライトノベル風に生成してくれない」問題の原因分析と対策の示唆**

---

## 要旨（結論）

学術研究を突き合わせると、**ライトノベルの文体的特徴と、現在のLLM（特にRLHF・指示チューニングを経たモデル）の出力特性は構造的に真逆の方向を向いている**。

* **ライトノベルの本質**:
  * 一般小説より「脱文脈化」が低く、発話の場（いま・ここ・わたし）に引きつけた口語的・対話的な語りを持つ（田中ら, 2025）。
  * 会話文（セリフ）と地の文の文末差が小さく、地の文にも終助詞・接続助詞が混ざる（土屋）。「のだ」や拡張ルビによって語り手と登場人物の視点を重ねる「二重の語り」が使われる（出原, 2015, 2023）。
  * 膨大な文末形式の書き分け（佐藤, 2024 / Jxiv）や役割語（金水, 2003; 朽方, 2017; 下條, 2015, 2020）でキャラクターを瞬時に立ち上げる。
* **現在のLLMの性質**:
  * **ポストトレーニング（RLHF / 指示チューニング）による文体圧縮**: 物語の感情・テーマ・文体の振れ幅を平坦化し（*Narrative Flattening*, `arXiv:2605.27878`）、プロバイダ間で似通った「自信満々で無難・説明的な既定文体（default style）」へ収束する（Rech & Bäckström, 2026）。
  * **不確実性と多様性の喪失**: プロ作家と比べて予測困難性（不確実性）が有意に低く（Sui et al., 2026）、文長・句読点・構文の振れ幅が極端に狭くなる（岩本ら, 2026; `arXiv:2608.12630`）。
  * **アライメントドリフト（Alignment Drift）**: プロンプトで文体や難易度を制約しても、生成が進むとモデルの既定文体へ引き戻される（`arXiv:2506.04072`; van Nuenen, 2026）。
  * **日本語特有の統計的癖**: 助詞バイグラム、「〜は、」の機械的な読点、文長の均一化は1-shot模倣でも完全には消えない（Zaitsu & Jin, 2023, 2024; 岩本ら, 2026）。
  * **構造・プロットの癖**: 単線的な展開、過剰なテーマ説明、無難で肯定的な着地に寄りやすく（Tianら, 2024; Xuら, 2025; Russellら, 2026 *StoryScope*）、LLM自身の自己添削・評価も専門家の判断と相関しない（Chakrabartyら, 2024, 2025）。

そのため、**「ラノベ風に書いて」と単発でプロンプト指示するだけでは、モデルの基底アライメントが押し返してしまい、優等生的な説明文や翻訳調の美文（「AI slop」）が出やすい**。

---

## 第1部：ライトノベルに関する学術論文

ライトノベル研究は主に以下の4系統に整理できる。

### 1. 文体・計量言語学（一般小説との違い）

| 著者・年 | 論文・発表 | 主な知見 |
| --- | --- | --- |
| 田中弥生・加藤祥・柏野和佳子（2025） | 「ライトノベルと一般小説の脱文脈化の観点からの分析」『社会言語科学会 第49回大会発表論文集』pp.227-230 | BCCWJ図書館サブコーパス等を対象に、テキストが「いま・ここ・わたし」のコミュニケーションの場にどれだけ依存しているか（脱文脈化）を修辞機能分析で比較。ライトノベルは一般小説より脱文脈化の度合いが低く、話し言葉的・場依存的な文体特性を持つ。 |
| 土屋葵 | 「ライトノベルにおける文章の計量的研究」（明治大学大学院 国際日本学研究科 修士論文要旨） | 『このライトノベルがすごい！』歴代1位作品群とBCCWJ日本文学作品を比較。一般小説に比べ、ライトノベルは**発話文と地の文の文末の乖離が小さく**、地の文にも終助詞・接続助詞などの助詞が多く現れることを定量的に示した。 |
| 三浦唯華・久保山哲二（2026） | 「生成 AI は Web 小説の文体に影響を及ぼしているのか？」言語処理学会第32回年次大会 P3-13 | 「小説家になろう」「カクヨム」の長期連載187作を分析し、近年のWeb小説では表記のひらがな化が進んでいることを報告。あわせて読点直前の文字分布にLLMモデルごとの癖が出ることも確認した（リポジトリ内 [sources.md](../skills/light-novel/references/sources.md) P4）。 |

### 2. 語り・視点・ルビ（認知言語学）

| 著者・年 | 論文・書籍 | 主な知見 |
| --- | --- | --- |
| 出原健一（2015） | 「ルビと視点 ―ライトノベルを中心に―」『日本認知言語学会論文集』第15巻, pp.90-99 | 漢字本来の読みと異なる語や意味を重ねる「拡張的ルビ」を取り上げ、書き手と作中人物の視点が重層的に表現される仕組みを認知言語学・視点論から分析。 |
| 出原健一（2023） | 「ライトノベルにおける二重の語り―「のだ」を中心に―」『日本認知言語学会論文集』第23巻, pp.106-117 | 地の文・文末に頻出する「のだ」に着目し、語り手の視点とキャラクターの視点が二重写しになる「二重の語り」の構造を解明。 |
| 出原健一（2021） | 『マンガ学からの言語研究——「視点」をめぐって』（ひつじ書房） | 拡張的ルビや自由間接話法・二重の視点など、ライトノベルとマンガに共通する主観表現の言語的仕組みを体系化。 |

### 3. セリフの書き分け・文末表現・役割語

| 著者・年 | 論文・発表 | 主な知見 |
| --- | --- | --- |
| 佐藤理史（2024 / 2026 / Jxiv） | 「小説のセリフの書き分けに使われる文末形式」（『言語資源ワークショップ発表論文集』第1巻, 2024）／「小説会話文の文末形式の自動認定」（Jxiv, DOI: 10.51094/jxiv.1401）／「小説のセリフの分析を支援するツールと言語資源」（NLP2026） | 小説会話文の文末形式自動認定システム **Kohaku** と、会話文で観察される文末形式リスト **Kohaku-FFL（1,923種類）** を構築。エンタメ小説・ライトノベルでキャラクター属性に応じて文末形式をどう使い分けているかを定量分析した。 |
| 石川和樹・小川浩平・佐藤理史（2024） / 川北雄大ら（2026） | 「口調エンコーダを用いた小説発話の話者推定」（『自然言語処理』31(3), 2024）／「評価用データセットを用いた口調エンコーダの性能評価と改良」（NLP2026） | セリフの文末や語彙の癖を「口調ベクトル」として埋め込み、話者推定や口調弁別を行う研究。キャラクターの口調が計算可能な特徴として存在することを示す一方、文脈なしでの識別・制御の難しさも扱う。 |
| 下條正純（2015 / 2020） | 「ライトノベルにおける「だ」で終わる発話文とキャラクター描写の関わり」（『立命館産業社会論集』51(2), 2015）／「調査結果に見るライトノベルの文末表現とキャラクターの繋がり」（同56(3), 2020） | 発話文の文末形式（「だ」等）とキャラクターの属性・イメージの結びつきを、日本語非母語話者（学習者）の理解調査も含めて検証。 |
| 朽方修一（2017） | 「ライトノベルにおける女性文末形式」『ヨーロッパ日本語教育』第21号, pp.148-153 | 金水敏の「役割語」研究を背景に、現実会話では減りつつある女性文末形式（「わ」「わよ」「こと」等）がライトノベルで意図的に使用され、キャラクターの「非凡さ」を演出する装置になっていることを分析。 |
| 金水敏（2003 / 2022） | 『ヴァーチャル日本語 役割語の謎』（岩波書店, 2003）／「ポライトネスとキャラクター」（『敬語の文法と語用論 1』, 2022） | フィクションにおける特定の話し方と人物像のステレオタイプ的結びつき（「役割語」）の理論的基盤。 |

### 4. 物語構造・Web小説（なろう系）・ジャンル・受容史

| 著者・年 | 論文・書籍 | 主な知見 |
| --- | --- | --- |
| 玉井建也（2020） | 「ウェブ小説に見る物語構造と虚構性 ―『転生したらスライムだった件』を事例として―」『東北芸術工科大学紀要』第27号 | 「小説家になろう」連載時のWEB版が、書籍化において「プロット」的な役割へ位置づけを変え、構造・虚構性が変容する過程を分析。 |
| 大橋崇行（2013〜2025） | 「キャラクターの神話」（2013）／「「なろう系」小説の現状とファンタジーをめぐる「教養」の変容」（2020）／「『文豪』とライトノベル」（2024）／「イチゼロ年代ライトノベルとＳＦ的想像力─安里アサト『86─エイティシックス─』」（2025） | ゼロ年代以降のキャラクター小説・なろう系・10年代SF系ラノベの変容を、読者像や文学史との接続から論考。 |
| 髙瀨真理子（2023 / 2024） | 「ライトノベルにおける物語の技法（二）―悪役令嬢の対するもの―」（2023）／「（三）―悪役令嬢の多様性―」（『歌子』32, 2024） | Web小説発・電子書籍・イラストやメディアミックスを伴う「悪役令嬢もの」の展開とキャラクター造形の多様性を分析。 |
| 一柳廣孝・久米依子編（2009 / 2013）／山中智省・大橋崇行編（2015-2016） | 『ライトノベル研究序説』（2009）／『ライトノベル・スタディーズ』（2013）／『ライトノベル・フロントライン 1〜3』（2015-2016）（青弓社） | メディアミックス、ジェンダー、読者論、語り口を網羅する基礎的論文集。 |

---

## 第2部：AIの癖のある表現（AI-isms・AI slop・日本語AI文体）に関する論文

### 1. 特定語彙の過剰使用とRLHF・アライメントのバイアス

* **Kobak et al. (2025 / arXiv 2024)** — *Delving into LLM-assisted writing in biomedical publications through excess vocabulary* (*Science Advances* 11(27), `arXiv:2406.07016`)
  * 2010〜2024年のPubMed要旨1,500万件以上を解析し、ChatGPT公開後に特定スタイル語（*delve* 等）が歴史的変動（コロナ禍等）を上回る規模で急増したことを実証。2024年の要旨の少なくとも13.5%（分野・地域により最大40%）にLLM関与の痕跡があると推定。
* **Juzek & Ward (2025)** — *Why Does ChatGPT 'Delve' So Much? Exploring the Sources of Lexical Overrepresentation in Large Language Models* (COLING 2025, `arXiv:2412.11385`)
  * 急増した21語（*delve*, *intricate*, *underscore* 等）の原因を検証。モデル構造や生の事前学習データからは説明がつかず、**RLHF**（アノテーターや報酬モデルが「丁寧・学術的・洗練された語彙」を好む傾向）が語彙過剰使用の一因であることを示唆。続報 *Word Overuse and Alignment in Large Language Models* (`arXiv:2508.01930`) でもアライメントの影響を追跡している。
* **Reinhart et al. (2025)** — *Do LLMs write like humans?* (*PNAS* 122(8), `arXiv:2410.16107`)
  * 英語において、指示調整済みモデルが分詞構文や名詞化を人間の数倍使う傾向を確認。
* **Paech et al. (2025)** — *Antislop* (`arXiv:2510.15061`) / **Shaib et al. (2025)** — *Measuring AI 'Slop' in Text* (`arXiv:2509.19163`)
  * 特定の決まり文句が人間の1,000倍以上の頻度で出現する例を示し、スロップ語の計測・抑制手法を提案。

### 2. 創作における「AIスロップ」「均質化」「不確実性の喪失」

* **Chakrabarty et al. (2024)** — *Art or Artifice? Large Language Models and the False Promise of Creativity* (ACM CHI 2024, `arXiv:2309.14556`)
  * トーランス創造性テストを応用した14項目（TTCW）でプロ作家とLLMを比較。プロ作家はLLMより3〜10倍多く基準を通過し、LLM作品は**クリシェへの依存、予測可能な構成、行間（サブテキスト）の欠如**が目立つ。またLLMの自動採点は専門家の評価と相関しない。
* **Chakrabarty, Laban, & Wu (2025a)** — *Can AI writing be salvaged?* (CHI 2025, `arXiv:2409.14509`)
  * 職業作家がAIの段落を修正した8,035件を分析し、修正理由が**ぎこちない語の選択（28%）、悪い文構造（20%）、不要な説明（18%）、クリシェ（17%）**に集中すること、特に「不要な説明」と「具体性の欠如」は減りにくいことを示した。
* **Chakrabarty, Laban, & Wu (2025b)** — *AI-Slop to AI-Polish? Aligning Language Models through Edit-Based Writing Rewards and Test-time Computation* (COLM 2025, `arXiv:2504.07532`)
  * 既存のLLMは文章品質の判定精度がランダムに近い一方、熟練者の編集履歴（LAMPコーパス）から報酬モデル（WQRM）を学習し推論時に複数案を選別すると、熟練作家の選好率が66%（スコア差大なら72.2%）に向上することを実証。
* **Sui et al. (2026)** — *LLMs Exhibit Significantly Lower Uncertainty in Creative Writing Than Professional Writers* (`arXiv:2602.16162`)
  * 28のLLMを情報理論的に解析。LLMはプロ作家より語彙・展開選択の**不確実性（エントロピー）が有意に低く**（「不確実性ギャップ」）、指示チューニングや推論モデルほど安全で予測可能なクリシェへ寄る傾向がある。
* **Novels generated by language models show compressed formal variation (2026)** (`arXiv:2608.12630`)
  * 長編小説単位のコーパスで検証し、1章単体では流暢に見えても作品群全体では文長・句読点・語彙多様性・可読性の分散が極端に狭い（**variance overclosure / 形式的多様性の圧縮**）ことを示した。
* **均質化・実利用・社会的受容に関する研究**:
  * **Doshi & Hauser (2024)** (*Science Advances*, `PMC11244532`) / **Anderson et al. (2024)** (`arXiv:2402.01536`) / **Sourati et al. (2025)** (`arXiv:2508.01491`): AI支援により個人の局所的評価は上がっても、集団全体のアイデアや表現が似通う「均質化効果」が発生する。
  * **Gupta, Antoniak, & Walsh (2026)** — *AI Fiction in the Wild* (`arXiv:2606.22748`): 実ユーザーのChatGPT創作ログ（WildChat）を解析し、反復的・定型的なジャンル創作が閉じたループで消費される実態を分析。
  * **Miklian & Katsos (2026)** — *"That's AI Slop, You Bot!"* (`arXiv:2606.12073`): Reddit / Hacker News上の議論から、「AI slop」という語が定型・低品質なAI文への批判フレームとして急拡大（批判の94%を占める）している実態を調査。

### 3. 物語構造レベルのAIの癖

* **Russell, Rajendhran, Pham, Iyyer, & Wieting (2026)** — *StoryScope: Investigating idiosyncrasies in AI fiction* (`arXiv:2604.03136`)
  * 61,608本の物語（人間＋5モデル）を304の物語特徴で分析。表層語彙を直しても、**物語構造だけで人間とAIを93.2%（macro-F1）で識別可能**。AIの物語は**テーマを説明しすぎ、単線的・直線的なプロットで曖昧な結末を綺麗に畳みたがる**（逆に人間は時間軸の複雑さや道徳的曖昧さを残す）。またモデル別にも「エスカレーションが平坦（Claude）」「夢落ちや噂話が多い（GPT）」「外見描写への依存が強い（Gemini）」等の指紋がある。
* **Tian et al. (2024)** (*EMNLP 2024*, `arXiv:2407.13248`) / **Xu et al. (2025)** (*PNAS*, `arXiv:2501.00273`)
  * LLMの物語は一様に肯定的で緊張感を欠き（Tianら）、同じ筋の要素の組み合わせを繰り返す（Xuら）。

### 4. 日本語AI生成文の文体的特徴（スタイロメトリ・検出研究）

* **Zaitsu & Jin (2023 / 2024)** — *PLOS ONE* 18(8), e0288453 (`PMC10411719`) / *PLOS ONE* 19(3), e0299031 (`PMC10936841`)
  * 科捜研の著者識別技術（計量文体学）を応用し、**読点の位置（特に「は」の直後の読点）、助詞・品詞のバイグラム、機能語比率**から日本語AI文を分析。読点位置だけでもGPT文と人間文を93.5%判別でき、GPT-4への進化や1-shotでの文体模倣を行っても統計的な癖は残る。
* **岩本海風・宮本友樹・内海彰（2026）** — 「大規模言語モデルで生成された文学テキストの検出と有効な識別的特徴の探求」言語処理学会第32回年次大会 P9-11
  * 日本語の短編小説で人間とLLMを分ける最大の特徴は**文長のばらつき（効果量 0.854）**であり、LLMは同じ長さの文を並べる傾向が強い。またLLMは語彙（タイプ・トークン比等）が乏しく、修飾の型の振れ幅も小さい。
* **林・相澤（2026）** — 「LLM による日本語生成におけるモデル固有表現パターンの分析」（NLP2026 B9-17） / **森川ほか（2026）**（NLP2026 Q3-6） / **三浦ほか（2024）**（NLP2024 P11-20）
  * 日本語LLMにはモデル固有の表現パターンがあり（林・相澤）、多くのドメインで人間より語彙多様性が低く（森川ら）、検出器は「予測しやすい語の並びの滑らかさ」を拾う（三浦ら）。
* **井関龍太（2023）** — 「人工知能の文章に文体はあるか――チャットAIが生成した物語文章の文体分析――」『日本心理学会第87回大会』
  * 「〇〇風ショートストーリー」を生成させても、AI側の均質な文体特性が現れることを検討した初期研究。

---

## 第3部：なぜ「現在ライトノベル風に生成してくれない」のか（原因と対策）

第1部と第2部の知見を統合すると、現在のLLMに「ライトノベル風に書いて」と頼んでもラノベらしくならない理由は、単なる語彙不足ではなく**以下の7つの構造的要因**に分解できる。

### 1. ポストトレーニングによる「文体平坦化」と「既定文体への引き戻し」
* **根拠**: *Narrative Flattening* (`arXiv:2605.27878`), *Confident by Default* (Rech & Bäckström, 2026), *Voice Under Revision* (van Nuenen, 2026), *Toward Beginner-Friendly LLMs* (`arXiv:2506.04072`)
* **起きていること**: 近年のモデルほどRLHFやSFTにより、「安全・中立・論理的・自信のあるアシスタント口調」が強く焼き付けられている。プロンプトで「砕けたラノベ調で」と指示しても、文章が長くなるほど**Alignment Drift（アライメント・ドリフト）**が起き、モデルの既定文体（硬い書き言葉・整理された解説調）へ引き戻される。逆に文体指定を強くしすぎると、今度は不自然な誇張表現や「大げさな美文（purple prose / AI slop）」へ暴走する。

### 2. 「脱文脈化の低さ」と「二重の語り」の失敗
* **根拠**: 田中ら（2025）、土屋、出原（2015, 2023）、Chakrabartyら（2025a）
* **起きていること**: ライトノベルの地の文は、語り手の主観や「いま・ここ」の臨場感が強く、セリフと地の文の境界が近い。しかしLLMは、行動や表情を書いた直後に「〜だったのだ」「大切なのは〜だと気づいた」と**外側から俯瞰して要約・説明し直す癖**がある（Chakrabartyらの言う「不要な説明 18%」や、本リポジトリ [ai-tells.md](../skills/light-novel/references/ai-tells.md) の「描写の直後の再要約」「テーマを地の文で言う」に一致）。これが語り手と主人公の一体感を壊す。

### 3. 文長・リズムの均一化による「テンポと緩急」の消失
* **根拠**: 岩本ら（2026）、Suiら（2026）、*Compressed Formal Variation* (`arXiv:2608.12630`)
* **起きていること**: ライトノベルは短いツッコミ・体言止め・改行と、少し長い情景・心理の文が混ざってリズムを生む。しかし日本語LLMは**文長が均質化**し（効果量 0.854）、20〜30字程度の文や同じ「〜た。〜た。」の文末を連続させやすい。さらに情報理論的な不確実性が低いため、読者の予想を少しずらす「笑いの間」や「引っかかりのある比喩」が出にくい。

### 4. 日本語の統語・機能語・読点における「翻訳調・AI癖」
* **根拠**: Zaitsu & Jin（2023, 2024）、Reinhartら（2025）、三浦・久保山（2026）、言語処理学会等の日本語LLM研究
* **起きていること**: 英語中心の学習と確率的予測の性質から、以下の癖がプロンプト指示を貫通して残る。
  * **主語の過剰明示**（日本語で自然なゼロ照応が減り、「俺は〜」「彼女は〜」が連発される）
  * **「〜は、」の機械的な読点**や、息継ぎ位置の不自然な読点
  * **直訳的な接続詞・無生物主語**（「むしろ」「したがって」「沈黙が答えだった」など）
  * **和語より漢語・カタカナ語への偏り**

### 5. キャラクターの「文末書き分け」と「役割語」の維持困難
* **根拠**: 佐藤（2024 / Jxiv / NLP2026）、朽方（2017）、下條（2015, 2020）、NLP2024（Prefix Tuningによるキャラクタ風発話生成）
* **起きていること**: 日本語の小説会話文には **1,923種に及ぶ文末形式（Kohaku-FFL）** の書き分けがあり、終助詞・丁寧さ・役割語の微細な組み合わせでキャラクターを立てる。LLMにキャラ設定をプロンプトだけで渡すと、**①全員が同じ平均的な丁寧／標準口調に潰れる**か、**②逆に口癖やステレオタイプ語尾（「〜わよ」「〜なのぜ」等）を毎場面機械的に連発する**かの両極端に振れやすい。

### 6. 物語構造の「一本道化」と「すぐ丸く収める」癖
* **根拠**: Russellら（2026 *StoryScope*）、Tianら（2024）、Xuら（2025）、Reaganら（2016）
* **起きていること**: ライトノベルの面白さは、未解決の引き、代償を伴う選択、ボケとツッコミによる緊張の緩和にある。対してLLMは**対立をその場で和解させ、テーマを綺麗に回収し、単線的で肯定的な結末へ収束する**バイアスが強い。

### 7. 「AIにラノベ風に直させる」自己修正が効きにくい
* **根拠**: Chakrabartyら（2024, 2025b）
* **起きていること**: LLM自身に「面白さ」「ラノベらしさ」を採点・修正させても、専門家の評価と相関せず、むしろ同じアライメント分布の中から別のクリシェを選ぶだけの結果になりやすい。

---

### 研究から導かれる実践的な突破口（対策の方向性）

論文および本リポジトリの設計（[ai-tells.md](../skills/light-novel/references/ai-tells.md) / [sources.md](../skills/light-novel/references/sources.md)）から、有効性が示唆されているアプローチは以下の通り。

1. **プロンプトの抽象指示（「ラノベ風」）をやめ、編集・構造レベルで制約を分離する**  
   * プロット・場面カード（引き、未解決要素、代償、感情の起伏）と、本文の文体生成を分離し、AIの「すぐ丸く収める」「テーマを説明する」構造的癖をカード段階で潰す（*StoryScope* や *Can AI writing be salvaged?* の知見と整合）。
2. **「書かせる」より「候補を出させて人間の基準（または編集モデル）で弾く・直す」**  
   * *AI-Slop to AI-Polish?* (`arXiv:2504.07532`) が示す通り、生成側の一発出力ではなく、熟練者の編集観点（不要な説明の削除、具体物への置き換え、クリシェの排除）を評価・推敲フェーズに組み込む方が効果が高い。
3. **統計的特徴（文長分散・読点位置・反復語）の機械的検知**  
   * *Antislop* (`arXiv:2510.15061`)、Kobakら（2025）、Zaitsu & Jin（2023）、岩本ら（2026）が示すように、文長のばらつき・読点の位置・決まり文句・口癖回数は定量化・カウント可能であり、スクリプト（本リポジトリの `check_style.py` 等）で検出してピンポイントで書き直すのが現実的。
4. **口調・文体の維持には「実例の対話見本（Few-shot）」と「盲検」を併用する**  
   * 文末形式のバリエーションや「地の文とセリフの近さ」は抽象的な性格記述では維持されないため、作品固有の会話見本を与え、台詞だけ抜いて話者を当てられるか（盲検）で事後検証する。
5. **技術的な将来方向（研究段階）**  
   * プロンプト頼みを超えた手法として、**スタイルベクトル／内部表現への介入**（NLP2024〜2026）、**口調エンコーダによる発話制御**（川北ら, 2026）、**不確実性を保つアライメント（Uncertainty-aware alignment）**（Suiら, 2026）が研究されている。

---

## 第4部：ソース一覧

### A. ライトノベル・Web小説・日本語文体に関する論文・書籍

1. **田中弥生・加藤祥・柏野和佳子（2025）** 「ライトノベルと一般小説の脱文脈化の観点からの分析」『社会言語科学会 第49回大会発表論文集』pp.227-230.（関連研究課題: JSPS科研費 23K00569）
2. **土屋葵** 「ライトノベルにおける文章の計量的研究」（明治大学大学院 国際日本学研究科 修士論文要旨）
3. **三浦唯華・久保山哲二（2026）** 「生成 AI は Web 小説の文体に影響を及ぼしているのか？」言語処理学会第32回年次大会 P3-13. https://www.anlp.jp/proceedings/annual_meeting/2026/pdf_dir/P3-13.pdf
4. **出原健一（2015）** 「ルビと視点 ―ライトノベルを中心に―」『日本認知言語学会論文集』第15巻, pp.90-99.
5. **出原健一（2023）** 「ライトノベルにおける二重の語り―「のだ」を中心に―」『日本認知言語学会論文集』第23巻, pp.106-117.
6. **出原健一（2021）** 『マンガ学からの言語研究——「視点」をめぐって』（ひつじ書房）
7. **出原健一（2022）** 「マンガの主観表現から言語の主観表現を考える」（阿部宏編『語りと主観性 物語における話法と構造を考える』ひつじ書房）
8. **佐藤理史（2024）** 「小説のセリフの書き分けに使われる文末形式」『言語資源ワークショップ発表論文集』第1巻.
9. **夏目和子・佐藤理史（2023）** 「エンタメ小説における会話文の発話意図分析―発話文表現文型辞書の改良に向けて―」『言語資源ワークショップ2023発表論文集』.
10. **佐藤理史** 「小説会話文の文末形式の自動認定」Jxiv プレプリント. https://doi.org/10.51094/jxiv.1401
11. **佐藤理史（2026）** 「小説のセリフの分析を支援するツールと言語資源」言語処理学会第32回年次大会（NLP2026）. https://www.anlp.jp/proceedings/annual_meeting/2026/
12. **川北雄大・小川浩平・佐藤理史（2026）** 「評価用データセットを用いた口調エンコーダの性能評価と改良」言語処理学会第32回年次大会（NLP2026）. https://www.anlp.jp/proceedings/annual_meeting/2026/
13. **石川和樹・小川浩平・佐藤理史（2024）** 「口調エンコーダを用いた小説発話の話者推定」『自然言語処理』31巻3号.
14. **大島一海・窪田智徳・小川浩平・佐藤理史（2024）** 「固有表現を対象とした小説登場人物検出」言語処理学会第30回年次大会（NLP2024）. https://www.anlp.jp/proceedings/annual_meeting/2024/
15. **松山諒平・佐藤理史・松崎拓也** 「人狼ログからの小説の自動生成」言語処理学会年次大会発表論文集.
16. **下條正純（2015）** 「ライトノベルにおける「だ」で終わる発話文とキャラクター描写の関わり」『立命館産業社会論集』第51巻第2号, pp.177-189.
17. **下條正純（2020）** 「調査結果に見るライトノベルの文末表現とキャラクターの繋がり」『立命館産業社会論集』第56巻第3号, pp.125-133.
18. **朽方修一（2017）** 「ライトノベルにおける女性文末形式」『ヨーロッパ日本語教育』第21号, pp.148-153.
19. **金水敏（2003）** 『ヴァーチャル日本語 役割語の謎』（岩波書店）
20. **金水敏（2022）** 「ポライトネスとキャラクター」『敬語の文法と語用論 1』.
21. **玉井建也（2020）** 「ウェブ小説に見る物語構造と虚構性 ―『転生したらスライムだった件』を事例として―」『東北芸術工科大学紀要』第27号.
22. **大橋崇行（2013）** 「キャラクターの神話―ゼロ年代ライトノベルの可能性」（一柳廣孝・久米依子編『ライトノベル・スタディーズ』青弓社）
23. **大橋崇行（2020）** 「「なろう系」小説の現状とファンタジーをめぐる「教養」の変容」『子どもの文化』52(12).
24. **大橋崇行（2024）** 「『文豪』とライトノベル」『文学・語学』242号.
25. **大橋崇行（2025）** 「イチゼロ年代ライトノベルとＳＦ的想像力─安里アサト『86─エイティシックス─』」『昭和文学研究』91号.
26. **髙瀨真理子（2023）** 「ライトノベルにおける物語の技法（二）―悪役令嬢の対するもの―」（実践女子大学）
27. **髙瀨真理子（2024）** 「ライトノベルにおける物語の技法（三）―悪役令嬢の多様性―」『歌子』32, pp.35-49.
28. **一柳廣孝・久米依子編（2009 / 2013）** 『ライトノベル研究序説』（2009）／『ライトノベル・スタディーズ』（2013）（青弓社）
29. **山中智省・大橋崇行編（2015-2016）** 『ライトノベル・フロントライン 1〜3』（青弓社）
30. **安本美典（1958）** 「文学の統計的研究法について」『統計科学研究』2(2)（※[sources.md](../skills/light-novel/references/sources.md) P17）
31. **本多勝一** 『〈新版〉日本語の作文技術』（朝日文庫）（※[sources.md](../skills/light-novel/references/sources.md) P18）
32. **山本雅子 / 王世和** 「語りのパースペクティヴ」（愛知大学）/『台湾日本語文学報』（※[sources.md](../skills/light-novel/references/sources.md) P20）

### B. AIの癖のある表現・創作の限界・日本語AI文体に関する論文

33. **Kobak, D., González-Márquez, R., Horvát, E.-Á., & Lause, J. (2025 / arXiv 2024)** "Delving into LLM-assisted writing in biomedical publications through excess vocabulary", *Science Advances*, 11(27). https://arxiv.org/abs/2406.07016
34. **Juzek, T. S., & Ward, Z. B. (2025)** "Why Does ChatGPT 'Delve' So Much? Exploring the Sources of Lexical Overrepresentation in Large Language Models", *Proceedings of COLING 2025*. https://arxiv.org/abs/2412.11385
35. **Juzek, T. S., & Ward, Z. B. (2025 / 2026)** "Word Overuse and Alignment in Large Language Models: The Influence of Learning from Human Feedback", arXiv:2508.01930. https://arxiv.org/abs/2508.01930
36. **Chakrabarty, T., Laban, P., Agarwal, D., Muresan, S., & Wu, C.-S. (2024)** "Art or Artifice? Large Language Models and the False Promise of Creativity", *ACM CHI 2024*. https://arxiv.org/abs/2309.14556
37. **Chakrabarty, T., Laban, P., & Wu, C.-S. (2025)** "Can AI writing be salvaged?", *ACM CHI 2025*. https://arxiv.org/abs/2409.14509
38. **Chakrabarty, T., Laban, P., & Wu, C.-S. (2025)** "AI-Slop to AI-Polish? Aligning Language Models through Edit-Based Writing Rewards and Test-time Computation", *COLM 2025*. https://arxiv.org/abs/2504.07532
39. **Sui, P. et al. (2026)** "LLMs Exhibit Significantly Lower Uncertainty in Creative Writing Than Professional Writers", arXiv:2602.16162. https://arxiv.org/abs/2602.16162
40. **(2026)** "Novels generated by language models show compressed formal variation", arXiv:2608.12630. https://arxiv.org/abs/2608.12630
41. **Russell, J., Rajendhran, R., Pham, C. M., Iyyer, M., & Wieting, J. (2026)** "StoryScope: Investigating idiosyncrasies in AI fiction", arXiv:2604.03136. https://arxiv.org/abs/2604.03136
42. **Li, Z., Zhu, Y., Wu, S., Bao, H., & Evans, J. A. (2026)** "Narrative Flattening: How Post-Training Compresses Thematic, Affective, and Stylistic Variation in LLM Fiction", arXiv:2605.27878. https://arxiv.org/abs/2605.27878
43. **Rech, S., & Bäckström, T. (2026)** "Confident by Default: A Longitudinal Study of Style Drift and Convergence Across Large Language Model Providers", *INLG 2026*.
44. **van Nuenen, T. (2026)** "Voice Under Revision: Large Language Models and the Normalization of Personal Narrative".
45. **(2026)** "Chunky Post-Training: Data Driven Failures of Generalization", arXiv:2602.05910. https://arxiv.org/abs/2602.05910
46. **(2025)** "Toward Beginner-Friendly LLMs for Language Learning: Controlling Difficulty in Conversation", arXiv:2506.04072. https://arxiv.org/abs/2506.04072
47. **Sourati, Z., Ziabari, A. S., & Dehghani, M. (2025)** "The Homogenizing Effect of Large Language Models on Human Expression and Thought", arXiv:2508.01491. https://arxiv.org/abs/2508.01491
48. **Anderson, B. R. et al. (2024)** "Homogenization Effects of Large Language Models on Human Creative Ideation", *ACM C&C 2024*. https://arxiv.org/abs/2402.01536
49. **Doshi, A. R., & Hauser, O. P. (2024)** "Generative AI enhances individual creativity but reduces the collective diversity of novel content", *Science Advances* 10(28). https://pmc.ncbi.nlm.nih.gov/articles/PMC11244532
50. **Xu et al. (2025)** "Echoes in AI: Quantifying lack of plot diversity in LLM outputs", *PNAS*. https://arxiv.org/abs/2501.00273
51. **Tian et al. (2024)** "Are Large Language Models Capable of Generating Human-Level Narratives?", *EMNLP 2024*. https://arxiv.org/abs/2407.13248
52. **Reinhart et al. (2025)** "Do LLMs write like humans?", *PNAS* 122(8). https://arxiv.org/abs/2410.16107
53. **Paech et al. (2025)** "Antislop", arXiv:2510.15061. https://arxiv.org/abs/2510.15061
54. **Shaib et al. (2025)** "Measuring AI 'Slop' in Text", arXiv:2509.19163. https://arxiv.org/abs/2509.19163
55. **Gupta, N., Antoniak, M., & Walsh, M. (2026)** "AI Fiction in the Wild", arXiv:2606.22748. https://arxiv.org/abs/2606.22748
56. **Miklian, J., & Katsos, J. E. (2026)** "'That's AI Slop, You Bot!' Studying Accusations, Evidence, and Credibility in Online Discourse Towards LLM-Generated Comments", arXiv:2606.12073. https://arxiv.org/abs/2606.12073
57. **Jentzsch, S., & Kersting, K. (2023)** "ChatGPT is fun, but it is not funny!", arXiv:2306.04563. https://arxiv.org/abs/2306.04563（※[sources.md](../skills/light-novel/references/sources.md) P27）
58. **Mirowski, P. et al. (2024)** "A Robot Walks into a Bar...", *FAccT 2024*. https://arxiv.org/abs/2405.20956（※[sources.md](../skills/light-novel/references/sources.md) P28）
59. **Zaitsu, W., & Jin, M. (2023)** "Distinguishing ChatGPT(-3.5, -4)-generated and human-written papers through Japanese stylometric analysis", *PLOS ONE* 18(8), e0288453. https://pmc.ncbi.nlm.nih.gov/articles/PMC10411719/
60. **Zaitsu, W., Jin, M., Ishihara, S., Tsuge, S., & Inaba, M. (2024)** "Can we spot fake public comments generated by ChatGPT(-3.5, -4)?: Japanese stylometric analysis expose emulation created by one-shot learning", *PLOS ONE* 19(3), e0299031. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10936841/
61. **岩本海風・宮本友樹・内海彰（2026）** 「大規模言語モデルで生成された文学テキストの検出と有効な識別的特徴の探求」言語処理学会第32回年次大会 P9-11. https://www.anlp.jp/proceedings/annual_meeting/2026/pdf_dir/P9-11.pdf
62. **森川ほか（2026）** 「日本語 LLM 生成テキスト識別データセットの構築」言語処理学会第32回年次大会 Q3-6. https://www.anlp.jp/proceedings/annual_meeting/2026/pdf_dir/Q3-6.pdf
63. **林・相澤（2026）** 「LLM による日本語生成におけるモデル固有表現パターンの分析」言語処理学会第32回年次大会 B9-17. https://www.anlp.jp/proceedings/annual_meeting/2026/pdf_dir/B9-17.pdf
64. **三浦・谷口・坂口・乾（2024）** 「検出器の判断に基づく大規模言語モデルの生成テキストの特徴分析」言語処理学会第30回年次大会 P11-20. https://www.anlp.jp/proceedings/annual_meeting/2024/pdf_dir/P11-20.pdf
65. **言語処理学会第30回年次大会（NLP2024）** 「Prefix Tuning とキャラクタ属性の加減算を利用したキャラクタ風発話生成」. https://www.anlp.jp/nlp2024/
66. **井関龍太（2023）** 「人工知能の文章に文体はあるか――チャットAIが生成した物語文章の文体分析――」『日本心理学会第87回大会』.

### C. リポジトリ内関連資料

67. [sources.md](../skills/light-novel/references/sources.md) — 本リポジトリの `light-novel` スキルが依拠する研究・道具・Web公開情報一覧
68. [ai-tells.md](../skills/light-novel/references/ai-tells.md) — AI文の具体的な癖一覧と確認手順
