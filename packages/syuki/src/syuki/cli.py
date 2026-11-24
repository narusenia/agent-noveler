"""syuki のコマンド。"""
from __future__ import annotations

import argparse
from collections import Counter
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

from . import check, edit, query, render
from .style import contrast, endings, excess, heat
from .work import KINDS, NotWritten, Work, find_conf


def emit(args, data, lines: list[str]):
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=1, default=str))
    else:
        print("\n".join(lines))


def cmd_check(work: Work, args) -> int:
    r = check.run(work)
    emit(args, {"items": r.items, "notices": r.notices}, r.text())
    return 1 if r.violations else 0


def cmd_impact(work: Work, args) -> int:
    try:
        data, lines, lost = check.impact(work, args.range)
    except ValueError as e:
        print(f"syuki: {e}", file=sys.stderr)
        return 2
    emit(args, data, lines)
    return 1 if lost else 0


def cmd_render(work: Work, args) -> int:
    written = render.render(work)
    emit(args, {"written": written}, [f"書いた: {w}" for w in written])
    return 0


def cmd_stages(work: Work, args) -> int:
    data, lines = render.stages(work)
    emit(args, data, lines)
    return 0


def cmd_edit(work: Work, args) -> int:
    try:
        if args.cmd == "add":
            data, lines = edit.add_event(work, args.kind, args.at, who=args.who, what=args.what, to=args.to,
                                         src=args.src, note=args.note, **{"from": args.from_})
        elif args.action == "add":
            data, lines = edit.ask_add(work, args.text, args.at, args.settle)
            if args.quiet:
                lines = [data["id"]]
        elif args.action == "settle":
            data, lines = edit.ask_settle(work, args.id, args.answer)
        else:
            data, lines = edit.ask_list(work, args.all, args.questions)
    except ValueError as e:
        print(f"syuki: {e}", file=sys.stderr)
        return 2
    emit(args, data, lines)
    return 0


def _run_tool_script(script: Path, args: list[str], *, input: str | None = None,
                     capture_output: bool = True, check: bool = False) -> subprocess.CompletedProcess:
    """check_style.py / voice_check.py を呼ぶ。手元に sudachipy があれば uv を挟まず直接起動する。"""
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}  # スキルのフォルダを汚さない
    if importlib.util.find_spec("sudachipy") is not None:
        return subprocess.run([sys.executable, str(script), *args], input=input,
                              capture_output=capture_output, text=True, encoding="utf-8", check=check, env=env)
    p = subprocess.run(["uv", "run", "--offline", "-q", str(script), *args], input=input,
                       capture_output=capture_output, text=True, encoding="utf-8", check=False, env=env)
    if p.returncode == 2:
        p = subprocess.run(["uv", "run", "-q", str(script), *args], input=input,
                           capture_output=capture_output, text=True, encoding="utf-8", check=False, env=env)
    if check and p.returncode != 0:
        raise subprocess.CalledProcessError(p.returncode, p.args, output=p.stdout, stderr=p.stderr)
    return p


def voice_counts(scripts: Path, pars: list[str]) -> list[dict]:
    """段落ごとの声（check_style --paragraphs）。空の段落は 0 文として返す。"""
    p = _run_tool_script(scripts / "check_style.py", ["--paragraphs"], input="\n\n".join(pars), check=True)
    by_line = {r["line"]: r for r in json.loads(p.stdout)}
    return [by_line.get(2 * i + 1, {"sentences": 0, "voiced": 0}) for i in range(len(pars))]


def ledger_names(work: Work) -> list[str]:
    """excess で外す名前（人物・用語・場所・持ち物）。"""
    terms = [n for t in work.rows("terms") for n in [t.get("term"), *(t.get("aliases") or [])] if n]
    return [*work.people, *terms, *work.place_names, *work.item_names]


def prose_lines(ch) -> list[str]:
    return [pl for _, raw, pl in ch.body_lines() if pl and not raw.lstrip().startswith("#") and "＊" not in pl]


def excess_report(work: Work, target, base: list, top: int, cache: dict) -> list[dict]:
    if "tok" not in cache:
        cache["tok"], cache["names"] = excess.tokenizer(), ledger_names(work)
    for ch in [target, *base]:
        if ch.rel not in cache:
            cache[ch.rel] = excess.grams(excess.tokens(prose_lines(ch), cache["names"], cache["tok"]))
    t, nouns = cache[target.rel]
    b = sum((cache[ch.rel][0] for ch in base), Counter())
    return excess.score(t, b, nouns, top=top)


def excess_lines(rows: list[dict]) -> list[str]:
    return [f"- [出すぎ・判断] 「{'・'.join(r['words'])}」{r['count']}回（一万語あたり {r['per_10k']}、基準 {r['base_per_10k']}、z {r['z']}）"
            for r in rows]


def speakers_file(work: Work, ch) -> Path:
    """盲検の答えの表（{行番号: 話者}）の置き場所。light-novel の check.md「盲検」の 答え.json。"""
    return work.root / "style" / "speakers" / ch.vol / f"{ch.id}.json"


def voice_endings(scripts: Path, text: str, names: list[str], answers: Path | None = None) -> list[dict]:
    extra = ["--answers", str(answers)] if answers and answers.is_file() else []
    p = _run_tool_script(scripts / "voice_check.py", ["endings", "--names", ",".join(names), *extra],
                         input=text, check=True)
    return json.loads(p.stdout)


def cmd_endings(work: Work, args, scripts: Path) -> int:
    try:
        chs = [work.chapter(*reversed(t.split("/", 1))) for t in args.chapters] or \
            [c for c in work.chapters if c.vol == work.volumes[-1]]
    except ValueError as e:
        print(f"syuki: {e}", file=sys.stderr)
        return 2
    rows = [r for ch in chs for r in voice_endings(scripts, "\n".join(ch.lines), list(work.people), speakers_file(work, ch))]
    answered = sum(speakers_file(work, ch).is_file() for ch in chs)
    keys, sample_text = [], []
    for c in work.characters:
        for v in (c.get("samples") or {}).values():
            if isinstance(v, str) and v.lstrip().startswith("「"):
                keys.append(work.people[c.get("short") or c["name"]])
                sample_text.append(v.strip())
    srows = voice_endings(scripts, "\n\n".join(sample_text), []) if sample_text else []
    samples = endings.tally(srows, lambda r: keys[(r["line"] - 1) // 2])
    data = endings.compare(endings.tally(rows, lambda r: work.people.get(r["speaker"], r["speaker"])), samples)

    def fmt(pairs):
        return "、".join(f"{e} {k}" for e, k in pairs) or "なし"
    lines = [f"台詞の文末（話者の決まった台詞 {len(rows)}件、答えの表 {answered}/{len(chs)}章。判断の材料）"]
    for d in data:
        off = "見本なし" if d["off_sample"] is None else f"見本に無い文末 {d['off_sample']:.0%}（{fmt(d['off_top'])}）"
        lines.append(f"- {d['speaker']}（{d['sentences']}文）本文: {fmt(d['top'])} / 見本: {fmt(d['sample_top'])} / {off}")
    emit(args, data, lines)
    return 0


def style_args(work: Work) -> list[str]:
    profile = work.root / work.conf.get("style", "style/profile.toml")
    return ["--profile", str(profile)] if profile.is_file() else []


def cmd_heat(work: Work, args, scripts: Path) -> int:
    try:
        ch = work.chapter(*reversed(args.chapter.split("/", 1)))
    except ValueError as e:
        print(f"syuki: {e}", file=sys.stderr)
        return 2
    p = _run_tool_script(scripts / "check_style.py", [*style_args(work), "--paragraphs", str(ch.path)], check=True)
    pars = json.loads(p.stdout)
    file = ch.path.relative_to(work.root / work.conf.get("manuscript", "manuscript")).as_posix()
    emit(args, {"file": file, "paragraphs": pars, **heat.summary(pars)}, heat.lines(file, pars))
    return 0


def cmd_style(work: Work, args) -> int:
    if args.action in ("endings", "heat"):
        scripts = check.lint_scripts(work.root)
        if scripts is None:
            print("syuki: 文体パックの scripts が見つからない", file=sys.stderr)
            return 2
        return (cmd_endings if args.action == "endings" else cmd_heat)(work, args, scripts)
    if args.action == "excess":
        try:
            target = work.chapter(*reversed(args.chapter.split("/", 1)))
            base = [work.chapter(x.split("/")[-1], x.split("/")[0] if "/" in x else target.vol)
                    for x in args.base.split(",")] if args.base else \
                [c for c in work.chapters if c.vol == target.vol and c is not target]
            rows = excess_report(work, target, base, args.top, {})
        except ValueError as e:
            print(f"syuki: {e}", file=sys.stderr)
            return 2
        except ImportError:
            print("syuki: sudachipy が要る（uv run --extra ja）", file=sys.stderr)
            return 2
        emit(args, {"chapter": target.rel, "base": [c.rel for c in base], "excess": rows},
             [f"## {target.rel}（基準: {', '.join(c.id for c in base)}）", *excess_lines(rows)])
        return 0
    scripts = check.lint_scripts(work.root)
    if scripts is None:
        print("syuki: 文体パックの scripts が見つからない", file=sys.stderr)
        return 2
    mdir = work.root / work.conf.get("manuscript", "manuscript")

    def read(rel):
        f = mdir / rel
        return f.read_text(encoding="utf-8").split("\n") if f.is_file() else None

    found, skipped = [], []
    for f in sorted((work.root / "review").glob("*.json")):
        got, miss = contrast.pairs(f.stem, json.loads(f.read_text(encoding="utf-8")).get("entries", []), read)
        found += got
        skipped += miss
    if found:
        counts = voice_counts(scripts, [x for p in found for x in (p["before"], p["after"])])
        for p, b, a in zip(found, counts[::2], counts[1::2]):
            p["before_voice"], p["after_voice"] = b, a
    # 候補は別のファイルに置く。spar は【候補】を含む contrast.md を送らないので、採用済みの対を止めないため
    out = work.root / "style" / "samples" / "contrast-candidates.md"
    adopted = work.root / "style" / "samples" / "contrast.md"
    text = out.read_text(encoding="utf-8") if out.is_file() else "# 温度の対の候補（作者の赤から）\n"
    if adopted.is_file():
        found = contrast.merge(adopted.read_text(encoding="utf-8"), found)[1]  # 採用済みの ID は足さない
    text, added = contrast.merge(text, found)
    if added and not args.dry_run:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    data = {"added": [p["key"] for p in added], "skipped": skipped, "file": str(out.relative_to(work.root))}
    lines = [f"{'足す' if args.dry_run else '足した'}: {k}" for k in data["added"]] or ["足す組なし"]
    emit(args, data, lines + [f"外した: {x}" for x in skipped] + [f"→ {data['file']}"])
    return 0


def cmd_lint(work: Work, args) -> int:
    scripts = check.lint_scripts(work.root)
    if scripts is None:
        print("syuki: 文体パックの scripts が見つからない", file=sys.stderr)
        return 2
    try:
        chs = [work.chapter(*reversed(t.split("/", 1))) for t in args.chapters] or \
            [c for c in work.chapters if c.vol == work.volumes[-1]]
    except ValueError as e:
        print(f"syuki: {e}", file=sys.stderr)
        return 2
    style = style_args(work)
    worst, results, cache = 0, [], {}
    for ch in chs:
        if not args.json:
            print(f"## {ch.rel}", flush=True)
        p = _run_tool_script(scripts / "check_style.py", [*style, *(["--json"] if args.json else []), str(ch.path)],
                             capture_output=args.json)
        worst = max(worst, p.returncode)
        if args.json:
            results.append({"chapter": ch.rel, "tool": "check_style", "code": p.returncode, "out": p.stdout})
        runs = [("keep_check", [sys.executable, str(scripts / "keep_check.py"), str(ch.path)])]
        if args.voice:
            runs.append(("voice_check", [sys.executable, str(scripts / "voice_check.py"), "sheet", str(ch.path)]))
        for name, cmd in runs:
            p = subprocess.run(cmd, capture_output=args.json, text=True, encoding="utf-8",
                               env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})  # スキルのフォルダを汚さない
            worst = max(worst, p.returncode)
            if args.json:
                results.append({"chapter": ch.rel, "tool": name, "code": p.returncode, "out": p.stdout})
        base = [c for c in work.chapters if c.vol == ch.vol and c is not ch]
        try:
            rows = excess_report(work, ch, base, 5, cache) if base else []
        except ImportError:
            rows = None
        if args.json:
            results.append({"chapter": ch.rel, "tool": "excess", "code": 0, "out": json.dumps(rows, ensure_ascii=False)})
        elif rows is None:
            print("（sudachipy が無いので出すぎた語の比較を飛ばした。uv run --extra ja で入る）")
        elif rows:
            print("出すぎた語（同じ巻のほかの章と比べて。判断の材料）", *excess_lines(rows), sep="\n")
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=1))
    return 1 if worst else 0


TEMPLATE = """\
# syuki の設定。書き方は harness/skills/syuki/references/schema.md
manuscript: manuscript
ext: .kym.txt
volumes: [vol1]
ledger: ledger
style: style/profile.toml
plots:
  vol1: plot.md
setting: []
stages: {}
render:
  characters: characters.md
"""


def cmd_init(args) -> int:
    root = Path(args.dir)
    files = {"syuki.yml": TEMPLATE}
    head = "# 書き方は harness/skills/syuki/references/schema.md\n"
    for name in ("characters", "terms", "items", "secrets", "threads", "documents", "questions"):
        files[f"ledger/{name}.yaml"] = head + "[]\n"
    files["ledger/world.yaml"] = head + "sections: {}\nincidents: []\n"
    files["ledger/places.yaml"] = head + "places: []\nroutes: []\n"
    files["ledger/vol1/scenes.yaml"] = head + "[]\n"
    files["ledger/vol1/events.yaml"] = head + "[]\n"
    # 文体パックの雛形（plot.md、style/profile.toml など）。作品のフォルダと同じ並びで置いてある
    templates = check.pack_templates(root.resolve())
    if templates is None:
        print("syuki: 文体パックの雛形（pack.toml の templates）が見つからないので、plot.md や style/ は作らなかった", file=sys.stderr)
    else:
        for f in sorted(templates.rglob("*")):
            if f.is_file():
                files[f.relative_to(templates).as_posix()] = f.read_text(encoding="utf-8")
    for rel, text in files.items():
        path = root / rel
        if path.exists():
            print(f"既存: {path}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(f"作成: {path}")
    (root / "manuscript" / "vol1").mkdir(parents=True, exist_ok=True)
    (root / "ledger" / "vol1" / "notes").mkdir(parents=True, exist_ok=True)
    return 0


def at_arg(work: Work, text):
    return work.point(text) if text else None


def cmd_query(work: Work, args) -> int:
    try:
        at = at_arg(work, getattr(args, "at", None))
        if args.cmd == "brief":
            try:
                pt = work.point(args.point)
            except NotWritten:
                data, lines = query.brief_ahead(work, args.point)
            else:
                data, lines = query.brief(work, pt)
        elif args.cmd == "search":
            data, lines = query.search(work, args.word, at)
        elif args.cmd == "state":
            data, lines = query.state_of(work, args.person, at)
        elif args.cmd == "knows":
            data, lines = query.knows(work, args.secret, at)
        elif args.cmd == "where":
            data, lines = query.where(work, args.item, at)
        elif args.cmd == "threads":
            data, lines = query.threads(work, at)
        elif args.cmd == "list":
            data, lines = query.listing(work, args.kind)
        elif args.cmd == "timeline":
            data, lines = query.timeline(work)
        else:
            data, lines = query.recap(work, work.point(args.until) if args.until else query.last_point(work))
    except ValueError as e:
        print(f"syuki: {e}", file=sys.stderr)
        return 2
    if work.problems:
        print(f"syuki: 台帳に形の問題が {len(work.problems)} 件（syuki check で見る）", file=sys.stderr)
    emit(args, data, lines)
    return 0


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    # pnpm から呼ぶと作業フォルダがリポジトリ直下になるので、呼んだ所（INIT_CWD）から探す
    common.add_argument("--work", default=os.environ.get("INIT_CWD", "."),
                        help="syuki.yml か、作品のフォルダ（既定は今いるフォルダから上へたどる）")
    common.add_argument("--json", action="store_true", help="JSON で出す")
    p = argparse.ArgumentParser(prog="syuki", description="小説の執筆支援（台帳・引用・照合）")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("check", parents=[common], help="台帳と本文を照合する")
    s.set_defaults(func=cmd_check)
    s = sub.add_parser("impact", parents=[common], help="本文の差分が台帳に与える影響")
    s.add_argument("range", nargs="?", default="HEAD", help="git の範囲（既定は HEAD と作業中の本文の差）")
    s.set_defaults(func=cmd_impact)
    for name, help_, pos in (
        ("brief", "場面を書く前の要約（カード・人物の状態・場所・文書・伏線）", ["point"]),
        ("search", "本文・台帳・設定集から語を探す", ["word"]),
        ("state", "人物の状態（知っていること・気持ち・持ち物・居場所）", ["person"]),
        ("knows", "秘密を誰が知っているか", ["secret"]),
        ("where", "持ち物がどこにあるか", ["item"]),
        ("threads", "伏線ごとの置いた・匂わせた・回収した所と予定", []),
        ("list", "台帳の名前の一覧（characters・terms・places・items・secrets・threads・documents）", ["kind"]),
        ("timeline", "場面を作中の日時順に並べる", []),
        ("recap", "本文の順のあらすじと出来事", []),
    ):
        s = sub.add_parser(name, parents=[common], help=help_)
        for a in pos:
            s.add_argument(a)
        if name in ("search", "state", "knows", "where", "threads"):
            s.add_argument("--at", help="章:場面。その場面の頭の時点で見る")
        if name == "recap":
            s.add_argument("--until", help="章（その章の終わりまで）か章:場面")
        s.set_defaults(func=cmd_query)
    s = sub.add_parser("render", parents=[common], help="台帳から人物・設定・地図・文書・状態表の Markdown を作る")
    s.set_defaults(func=cmd_render)
    s = sub.add_parser("stages", parents=[common], help="人物ごとの好意の段階と、しばらく出ていない人物")
    s.set_defaults(func=cmd_stages)
    s = sub.add_parser("ask", parents=[common], help="作者に確かめたいことの待ち行列")
    acts = s.add_subparsers(dest="action", required=True)
    a = acts.add_parser("add", parents=[common], help="確かめたいことを足す")
    a.add_argument("text")
    a.add_argument("--at", help="章:場面")
    a.add_argument("--settle", metavar="ANSWER", help="足してすぐ決着させる（答え）")
    a.add_argument("--quiet", action="store_true", help="足した ID だけを出す")
    a = acts.add_parser("list", parents=[common], help="未決着の一覧と【本文仮】の確定待ち")
    a.add_argument("--all", action="store_true", help="決着済みも出す")
    a.add_argument("--questions", action="store_true", help="作者への問いだけを出す（【本文仮】の確定待ちを出さない）")
    a = acts.add_parser("settle", parents=[common], help="決着を記録する")
    a.add_argument("id")
    a.add_argument("answer")
    s.set_defaults(func=cmd_edit)
    s = sub.add_parser("add", parents=[common], help="出来事を events.yaml に足す（時点の順に入れる）")
    s.add_argument("kind", help=" / ".join(KINDS))
    s.add_argument("--at", required=True, help="章:場面")
    s.add_argument("--who", action="append", help="人物（何度でも）")
    s.add_argument("--what")
    s.add_argument("--to")
    s.add_argument("--from", dest="from_")
    s.add_argument("--src", help="引用「章「本文の字」」")
    s.add_argument("--note")
    s.set_defaults(func=cmd_edit)
    s = sub.add_parser("lint", parents=[common], help="文体パックの lint（check_style・keep_check）を章ごとに回す")
    s.add_argument("chapters", nargs="*", help="章（既定は最後の巻の全章）")
    s.add_argument("--voice", action="store_true", help="voice_check の台詞の表も出す")
    s.set_defaults(func=cmd_lint)
    s = sub.add_parser("style", parents=[common], help="文体の解析（判断の材料）")
    acts = s.add_subparsers(dest="action", required=True)
    a = acts.add_parser("contrast", parents=[common], help="作者の赤から温度の対の候補を style/samples/contrast-candidates.md に足す")
    a.add_argument("--dry-run", action="store_true", help="書かずに足す組だけを出す")
    a = acts.add_parser("excess", parents=[common], help="章で基準の章より出すぎた語の並び（原形の 1〜3 語、対数オッズ）")
    a.add_argument("chapter", help="章（巻が二つ以上なら vol1/04）")
    a.add_argument("--base", help="基準の章（カンマ区切り。既定は同じ巻のほかの章）")
    a.add_argument("--top", type=int, default=20)
    a = acts.add_parser("endings", parents=[common], help="台詞の文末を人物ごとに数え、口調サンプルの文末とのずれを出す")
    a.add_argument("chapters", nargs="*", help="章（既定は最後の巻の全章）")
    a = acts.add_parser("heat", parents=[common], help="段落ごとの声・声なし区間・落とし（check_style の判定。shosai が色を付ける）")
    a.add_argument("chapter", help="章（巻が二つ以上なら vol1/04）")
    s.set_defaults(func=cmd_style)
    s = sub.add_parser("init", help="作品のフォルダに syuki.yml と ledger/ の雛形を作る")
    s.add_argument("dir", nargs="?", default=".")
    s.set_defaults(func=None)
    return p


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    args = build_parser().parse_args(argv)
    if args.cmd == "init":
        return cmd_init(args)
    work = Work(find_conf(Path(args.work)))
    return args.func(work, args)


if __name__ == "__main__":
    sys.exit(main())
