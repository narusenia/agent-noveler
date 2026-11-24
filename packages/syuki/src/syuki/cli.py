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
    emit(args, {"written": written}, [f"Wrote: {w}" for w in written])
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
    return [f"- [excess, judgment] 「{'・'.join(r['words'])}」 {r['count']} times (per 10k words {r['per_10k']}, baseline {r['base_per_10k']}, z {r['z']})"
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
        return ", ".join(f"{e} {k}" for e, k in pairs) or "none"
    lines = [f"Dialogue endings ({len(rows)} lines with a known speaker, answer tables for {answered}/{len(chs)} chapters; for judgment)"]
    for d in data:
        off = "no samples" if d["off_sample"] is None else f"off-sample endings {d['off_sample']:.0%} ({fmt(d['off_top'])})"
        lines.append(f"- {d['speaker']} ({d['sentences']} sentences) manuscript: {fmt(d['top'])} / samples: {fmt(d['sample_top'])} / {off}")
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
            print("syuki: style pack scripts not found", file=sys.stderr)
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
            print("syuki: sudachipy is required (uv run --extra ja)", file=sys.stderr)
            return 2
        emit(args, {"chapter": target.rel, "base": [c.rel for c in base], "excess": rows},
             [f"## {target.rel} (baseline: {', '.join(c.id for c in base)})", *excess_lines(rows)])
        return 0
    scripts = check.lint_scripts(work.root)
    if scripts is None:
        print("syuki: style pack scripts not found", file=sys.stderr)
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
    lines = [f"{'Would add' if args.dry_run else 'Added'}: {k}" for k in data["added"]] or ["No pairs to add"]
    emit(args, data, lines + [f"Skipped: {x}" for x in skipped] + [f"→ {data['file']}"])
    return 0


def cmd_lint(work: Work, args) -> int:
    scripts = check.lint_scripts(work.root)
    if scripts is None:
        print("syuki: style pack scripts not found", file=sys.stderr)
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
            print("(sudachipy is not installed, so the excess-word comparison was skipped. Install it with uv run --extra ja)")
        elif rows:
            print("Excess words (compared with the other chapters of the volume; for judgment)", *excess_lines(rows), sep="\n")
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
        print("syuki: style pack templates (templates in pack.toml) not found, so plot.md and style/ were not created", file=sys.stderr)
    else:
        for f in sorted(templates.rglob("*")):
            if f.is_file():
                files[f.relative_to(templates).as_posix()] = f.read_text(encoding="utf-8")
    for rel, text in files.items():
        path = root / rel
        if path.exists():
            print(f"Exists: {path}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(f"Created: {path}")
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
        print(f"syuki: {len(work.problems)} ledger shape problem(s) (see syuki check)", file=sys.stderr)
    emit(args, data, lines)
    return 0


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    # pnpm から呼ぶと作業フォルダがリポジトリ直下になるので、呼んだ所（INIT_CWD）から探す
    common.add_argument("--work", default=os.environ.get("INIT_CWD", "."),
                        help="syuki.yml or the work folder (default: search up from the current folder)")
    common.add_argument("--json", action="store_true", help="output JSON")
    p = argparse.ArgumentParser(prog="syuki", description="Novel writing support (ledger, quotes, checks)")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("check", parents=[common], help="check the ledger against the manuscript")
    s.set_defaults(func=cmd_check)
    s = sub.add_parser("impact", parents=[common], help="how a manuscript diff affects the ledger")
    s.add_argument("range", nargs="?", default="HEAD", help="git range (default: HEAD vs. the working manuscript)")
    s.set_defaults(func=cmd_impact)
    for name, help_, pos in (
        ("brief", "summary before writing a scene (card, character state, place, documents, threads)", ["point"]),
        ("search", "search the manuscript, ledger and setting notes for a word", ["word"]),
        ("state", "a character's state (knowledge, feelings, items, location)", ["person"]),
        ("knows", "who knows a secret", ["secret"]),
        ("where", "where an item is", ["item"]),
        ("threads", "where each thread was planted, hinted and paid off, and its plan", []),
        ("list", "list ledger names (characters, terms, places, items, secrets, threads, documents)", ["kind"]),
        ("timeline", "scenes in story-time order", []),
        ("recap", "summaries and events in manuscript order", []),
    ):
        s = sub.add_parser(name, parents=[common], help=help_)
        for a in pos:
            s.add_argument(a)
        if name in ("search", "state", "knows", "where", "threads"):
            s.add_argument("--at", help="chapter:scene; look as of the start of that scene")
        if name == "recap":
            s.add_argument("--until", help="chapter (up to its end) or chapter:scene")
        s.set_defaults(func=cmd_query)
    s = sub.add_parser("render", parents=[common], help="generate Markdown for characters, setting, map, documents and state tables from the ledger")
    s.set_defaults(func=cmd_render)
    s = sub.add_parser("stages", parents=[common], help="affection stage per character, and characters absent for a while")
    s.set_defaults(func=cmd_stages)
    s = sub.add_parser("ask", parents=[common], help="queue of questions for the author")
    acts = s.add_subparsers(dest="action", required=True)
    a = acts.add_parser("add", parents=[common], help="add a question")
    a.add_argument("text")
    a.add_argument("--at", help="chapter:scene")
    a.add_argument("--settle", metavar="ANSWER", help="add and settle at once (the answer)")
    a.add_argument("--quiet", action="store_true", help="print only the new ID")
    a = acts.add_parser("list", parents=[common], help="open questions and 【本文仮】 items awaiting confirmation")
    a.add_argument("--all", action="store_true", help="include settled questions")
    a.add_argument("--questions", action="store_true", help="only questions for the author (omit 【本文仮】 items)")
    a = acts.add_parser("settle", parents=[common], help="record a settlement")
    a.add_argument("id")
    a.add_argument("answer")
    s.set_defaults(func=cmd_edit)
    s = sub.add_parser("add", parents=[common], help="add an event to events.yaml (kept in point order)")
    s.add_argument("kind", help=" / ".join(KINDS))
    s.add_argument("--at", required=True, help="chapter:scene")
    s.add_argument("--who", action="append", help="character (repeatable)")
    s.add_argument("--what")
    s.add_argument("--to")
    s.add_argument("--from", dest="from_")
    s.add_argument("--src", help="quote 章「本文の字」")
    s.add_argument("--note")
    s.set_defaults(func=cmd_edit)
    s = sub.add_parser("lint", parents=[common], help="run the style pack lint (check_style, keep_check) per chapter")
    s.add_argument("chapters", nargs="*", help="chapters (default: every chapter of the last volume)")
    s.add_argument("--voice", action="store_true", help="also print the voice_check dialogue sheet")
    s.set_defaults(func=cmd_lint)
    s = sub.add_parser("style", parents=[common], help="style analysis (for judgment)")
    acts = s.add_subparsers(dest="action", required=True)
    a = acts.add_parser("contrast", parents=[common], help="add contrast pair candidates from the author's edits to style/samples/contrast-candidates.md")
    a.add_argument("--dry-run", action="store_true", help="print the pairs without writing")
    a = acts.add_parser("excess", parents=[common], help="word n-grams overused in a chapter vs. baseline chapters (1-3 lemmas, log-odds)")
    a.add_argument("chapter", help="chapter (vol1/04 if there are several volumes)")
    a.add_argument("--base", help="baseline chapters (comma-separated; default: the other chapters of the volume)")
    a.add_argument("--top", type=int, default=20)
    a = acts.add_parser("endings", parents=[common], help="count dialogue endings per character and compare with the voice samples")
    a.add_argument("chapters", nargs="*", help="chapters (default: every chapter of the last volume)")
    a = acts.add_parser("heat", parents=[common], help="voice, no-voice runs and drops per paragraph (check_style's judgment; shosai colors them)")
    a.add_argument("chapter", help="chapter (vol1/04 if there are several volumes)")
    s.set_defaults(func=cmd_style)
    s = sub.add_parser("init", help="create syuki.yml and ledger/ templates in a work folder")
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
