#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["sudachipy>=0.6", "sudachidict-core"]
# ///
"""台詞を名前なしで区別できるかを確かめる（盲検）。手順は references/check.md「盲検」。

使い方:
  uv run voice_check.py sheet 本文.txt
      地の文を抜いた台詞だけの表を出す。話者を当てる側には、これと人物ファイルだけを渡す。
  uv run voice_check.py report 本文.txt --answers 答え.json [--guesses 推定.json]
      答え（本文を読んだ側が付けた {行番号: 話者}）と推定を突き合わせ、外れた台詞を出す。
      あわせて人物ごとの一人称と語尾の分布を出す。答えは check_style.py --speakers にも渡せる。
  uv run voice_check.py endings 本文.txt --names ハル,ソラ [--answers 答え.json]
      話者の決まった台詞（答えの表か、同じ行の「と〇〇が言った」）の文ごとの語尾を JSON で出す。
結果はすべて判断の材料で、違反ではない。外れた台詞を直すか残すかは書き手が決め、迷ったら作者に聞く。
終了コードは常に 0。
"""
import argparse
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_style  # noqa: E402

FIRST_PERSON = {"俺", "僕", "私", "わたし", "あたし", "わたくし", "うち", "自分", "我", "儂", "わし", "おれ", "ぼく"}


def speeches(text):
    """会話行の「」の中身を (行番号, 中身) で返す。"""
    found = []
    for i, kind, line in check_style.rows_of(text):
        if kind == "dialogue":
            found += [(i, m.group(1)) for m in check_style.SPEECH.finditer(line)]
    return found


def ending(content):
    """台詞の語尾。最後の文の、記号を除いた末尾の機能語の並び（2語まで）。"""
    last = (check_style.sentences(content) or [content])[-1]
    words = [t for t in check_style.tokenize(last) if not check_style.is_symbol(t)]
    tail = []
    for t in reversed(words):
        if t[1] in ("助詞", "助動詞") and len(tail) < 2:
            tail.insert(0, t[0])
        else:
            break
    if not tail and words:
        tail = ["（" + words[-1][1] + "止め）"]
    return "".join(tail)


def first_persons(content):
    return [t[0] for t in check_style.tokenize(content) if t[1] == "代名詞" and t[0] in FIRST_PERSON]


def load_table(path):
    with open(path, encoding="utf-8") as f:
        return {int(k): v for k, v in json.load(f).items()}


def sheet(text):
    for i, content in speeches(text):
        print(f"{i}: 「{content}」")


def report(text, answers, guesses=None):
    by_line = defaultdict(list)
    for i, content in speeches(text):
        by_line[i].append(content)
    if guesses is not None:
        judged = [i for i in by_line if i in answers and i in guesses]
        misses = [i for i in judged if answers[i] != guesses[i]]
        for i in misses:
            print(f"- [口調・判断] {i}行目「{'」「'.join(by_line[i])}」: 答え {answers[i]} / 推定 {guesses[i]}")
        hit = len(judged) - len(misses)
        rate = f"（{hit / len(judged):.0%}）" if judged else ""
        print(f"台詞ごとの当たり {hit}/{len(judged)}{rate}")
        confused = Counter((answers[i], guesses[i]) for i in misses)
        for (a, g), n in confused.most_common(5):
            print(f"- 取り違え: {a} → {g} {n}件")
    print("人物ごとの分布")
    profile = defaultdict(lambda: {"n": 0, "first": Counter(), "end": Counter()})
    for i, contents in by_line.items():
        who = answers.get(i)
        if not who:
            continue
        for c in contents:
            p = profile[who]
            p["n"] += 1
            p["first"].update(first_persons(c))
            p["end"][ending(c)] += 1
    for who, p in sorted(profile.items(), key=lambda x: -x[1]["n"]):
        first = ", ".join(f"{w} {n}" for w, n in p["first"].most_common(3)) or "なし"
        end = ", ".join(f"{w} {n}" for w, n in p["end"].most_common(5) if w)
        print(f"- {who}（{p['n']}）一人称: {first} / 語尾: {end}")


def endings(text, names=(), answers=None):
    """話者の決まった台詞の文ごとの語尾。話者は答えの表か、同じ行の地の文（「と〇〇が言った」）から決める。
    names を空にすると話者を決めずに全部の台詞を出す（口調サンプルを数えるとき）。"""
    names = sorted(names, key=len, reverse=True)
    rows = {i: line for i, kind, line in check_style.rows_of(text) if kind == "dialogue"}
    out = []
    for i, content in speeches(text):
        who = (answers or {}).get(i) or (check_style.tagged_speaker(rows[i], names) if names else None)
        if names and not who:
            continue
        out.append({"line": i, "speaker": who, "endings": [ending(s) for s in check_style.sentences(content) or [content]]})
    return out


def main(argv):
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="台詞の盲検")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("sheet", help="台詞だけの表を出す")
    s.add_argument("file")
    r = sub.add_parser("report", help="答えと推定を突き合わせる")
    r.add_argument("file")
    r.add_argument("--answers", required=True, help="{行番号: 話者} の答え")
    r.add_argument("--guesses", help="{行番号: 話者} の推定")
    e = sub.add_parser("endings", help="話者の決まった台詞の文末を JSON で出す（syuki style endings が読む）")
    e.add_argument("file", nargs="?", help="本文。省略すると標準入力")
    e.add_argument("--names", default="", help="話者の名前（カンマ区切り）。省略すると全部の台詞")
    e.add_argument("--answers", help="{行番号: 話者} の答え")
    args = parser.parse_args(argv[1:])
    text = check_style.read(args.file) if args.file else sys.stdin.read()
    if args.command == "endings":
        names = [n for n in args.names.split(",") if n]
        print(json.dumps(endings(text, names, load_table(args.answers) if args.answers else None), ensure_ascii=False))
    elif args.command == "sheet":
        sheet(text)
    else:
        report(text, load_table(args.answers), load_table(args.guesses) if args.guesses else None)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
