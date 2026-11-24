"""台帳に書き足すコマンド: ask（作者への確認の待ち行列）と add（出来事の追記）。"""
from __future__ import annotations

import datetime
import json
import re

import yaml

from .work import KINDS, Work

PROVISIONAL = "【本文仮】"


def dump(rows) -> str:
    return yaml.safe_dump(rows, allow_unicode=True, sort_keys=False, width=1000)


def today() -> str:
    return datetime.date.today().isoformat()


def ask_add(work: Work, q: str, at: str | None, answer: str | None = None):
    if at:
        work.point(at)  # 形を確かめる
    rows = work.rows("questions")
    nums = [int(m[1]) for r in rows if (m := re.fullmatch(r"Q-(\d+)", str(r.get("id"))))]
    row = {"id": f"Q-{max(nums, default=0) + 1:03d}", "q": q, **({"at": at} if at else {}), "status": "open", "asked": today()}
    if answer is not None:  # 足して即決着
        row.update(status="settled", answer=answer, settled=today())
    _write_questions(work, rows + [row])
    return row, [f"足した: {row['id']} {q}" + (f" → 決着: {answer}" if answer is not None else "")]


def ask_settle(work: Work, qid: str, answer: str):
    rows = work.rows("questions")
    row = next((r for r in rows if r.get("id") == qid), None)
    if row is None:
        raise ValueError(f"{qid} が questions.yaml に無い")
    row.update(status="settled", answer=answer, settled=today())
    _write_questions(work, rows)
    return row, [f"決着: {qid} {answer}"]


def _write_questions(work: Work, rows):
    path = work.ledger_dir / "questions.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump(rows), encoding="utf-8")


def ask_list(work: Work, all_: bool, questions_only: bool = False):
    qs = [r for r in work.rows("questions") if all_ or r.get("status", "open") == "open"]
    prov = []
    for path in [] if questions_only else sorted(work.ledger_dir.rglob("*.yaml")):
        for i, x in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
            if PROVISIONAL in x:
                prov.append({"where": f"{path.relative_to(work.root).as_posix()}:{i}", "text": x.strip().lstrip("- ")})
    out = [f"## 作者に確認 {len(qs)} 件"]
    out += [f"- {r.get('id')}［{r.get('status', 'open')}］{r.get('q')}" + (f"（{r['at']}）" if r.get("at") else "")
            + (f" → {r['answer']}" if r.get("answer") else "") for r in qs]
    if questions_only:
        return {"questions": qs}, out
    out += [f"## {PROVISIONAL}の確定待ち {len(prov)} 件", *[f"- {p['where']} {p['text']}" for p in prov]]
    return {"questions": qs, "provisional": prov}, out


def add_event(work: Work, kind: str, at: str, **fields):
    if kind not in KINDS:
        raise ValueError(f"種類「{kind}」は {' / '.join(KINDS)} のどれか")
    vol = work.ch_of(pt := work.point(at)).vol
    row = {"at": at, "kind": kind}
    for k in ("who", "what", "to", "from", "src", "note"):
        v = fields.get(k)
        if v:
            row[k] = v[0] if isinstance(v, list) and len(v) == 1 else v
    missing = [k for k in KINDS[kind] if k not in row]
    if missing:
        raise ValueError(f"{kind} には {'・'.join(missing)} が要る")
    path = work.ledger_dir / vol / "events.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").split("\n") if path.is_file() else []
    # 時点の順を保つ: 後ろの時点の最初の行の前に入れる。無ければ末尾
    later = min((e["_i"] for e in work.events if e["_vol"] == vol and e["_pt"] > pt), default=None)
    starts = [i for i, x in enumerate(lines) if x.startswith("- ")]
    text = dump([row]).rstrip("\n").split("\n")
    if later is not None and later < len(starts):
        lines[starts[later]:starts[later]] = text
    else:
        while lines and not lines[-1].strip():
            lines.pop()
        lines += text
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return row, [f"足した: {path.relative_to(work.root).as_posix()} {json.dumps(row, ensure_ascii=False)}（名前の照合は syuki check）"]
