# proofreader の見方（light-novel）

核の手順書 `agents/proofreader.md` に重ねて読む。

- 口調の盲検は light-novel の `references/check.md`「盲検」。
- 文体は light-novel の制約（説明台詞、比喩の多さ、感情ラベルの段落終わり、同じ文末の三連続、章末の要約、人づての説明と推量の「らしい」の連発、無生物主語）。
- 会話の悪い例は light-novel の `references/dialogue-examples.md`。
- 直したあとの lint は `uv run --offline .agents/skills/light-novel/scripts/check_style.py --baseline 元 章`（`syuki lint` でもよい）。
- 温度合わせの語り手の話し声は、口語の文末、ツッコミ、ぼやき。
