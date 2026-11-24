---
trigger: always_on
description: light-novel パックを使うときの決まり（lint、会話と感情、口調）
---

# light-novel パックを使うときの決まり

light-novel パックを使うときは、次を守る。

- lint は `syuki lint <章>`（中身は `.agents/skills/light-novel/scripts/check_style.py`）。作品ごとの文体の設定（リズムの型、口癖、決まり文句の追加、残す文、会話の見本）は、作品のフォルダの `style/` に置く。
- **読みやすさを lint より優先する。** lint は目安で、違反 0 を目指さない。「文を短く切れ」という指摘に寄せすぎると、文が細切れになり、情景や戦闘の描写が痩せる。指摘が読みやすさとぶつかったら、読みやすさを取る。当て方は `.agents/rules/prose-tools.md`。
- **会話は生きた話し言葉に、感情は山場で外に出す。** 書き方は light-novel の `references/style.md`、悪い例と良い例は `references/dialogue-examples.md`（作品の本文から作った見本は、作品の `style/dialogue-examples.md`）。
- **口調は固めすぎない。** lint の台詞の読点・口癖と、盲検で外れた台詞は「判断」の指摘で、違反ではない。意図があれば残し、迷ったら作者に聞く。作者が気に入った文は作品の `style/keep.md` に書き、どの作業でも変えない。
