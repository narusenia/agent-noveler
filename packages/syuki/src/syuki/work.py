"""作品の読み込み: syuki.yml、本文の章と場面、台帳の YAML、時点と引用。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

CONF_NAME = "syuki.yml"
BREAK = re.compile(r"^[\s　]*＊[\s　]*$")
EMPH = re.compile(r"《《(.*?)》》")
RUBY = re.compile(r"[｜|]([^｜|《》\n]+)《[^》\n]*》")
READING = re.compile(r"《[^》\n]*》")
SPACE = re.compile(r"[\s　]+")
ANCHOR = re.compile(r"^(?:(?P<vol>[^/「」\s]+)/)?(?P<ch>[^/「」\s]+)「(?P<quote>.+)」$", re.S)
POINT = re.compile(r"^(?:(?P<vol>[^/:\s]+)/)?(?P<ch>[^/:\s]+)(?::(?P<scene>\d+))?$")

GLOBAL_FILES = ["characters", "world", "terms", "places", "items", "secrets", "threads", "documents", "questions"]
VOL_FILES = ["scenes", "events"]

# 型: str int bool list dict anchor anchors point names、末尾の ! は必須。dict の値は入れ子の行の形。OneOf は決まった値
@dataclass(frozen=True)
class OneOf:
    values: tuple
    need: bool = False


PLAN_DO = ("hint", "payoff")
READERS = ("disclosed", "hinted", "hidden")
QUESTION_STATUS = ("open", "settled")
PLACE = {"name": "str!", "aliases": "list", "in": "str", "where": "str", "looks": "str", "src": "anchors", "notes": "list"}
ROUTE = {"from": "str!", "to": "str!", "via": "str", "time": "str", "minutes": "int", "src": "anchors"}
PLAN = {"at": "point!", "do": OneOf(PLAN_DO, need=True), "note": "str"}
INCIDENT = {"at": "point!", "day": "str", "what": "str!", "record": "str"}
SCHEMA = {
    "characters": [{"name": "str!", "short": "str", "aliases": "list", "role": "str", "profile": "dict",
                    "catchphrases": "list", "samples": "dict", "notes": "list", "lines": "anchors"}],
    "world": {"sections": "dict", "incidents": [INCIDENT]},
    "terms": [{"term": "str!", "reading": "str", "explained": "anchor", "note": "str", "basic": "bool", "hidden_until": "point"}],
    "places": {"places": [PLACE], "routes": [ROUTE]},
    "items": [{"name": "str!", "aliases": "list", "desc": "str", "holder": "str", "notes": "list"}],
    "secrets": [{"id": "str!", "fact": "str!", "reader": OneOf(READERS), "reader_note": "str", "markers": "list", "known": "list", "note": "str"}],
    "threads": [{"id": "str!", "desc": "str!", "plan": [PLAN], "phrases": "anchors", "note": "str"}],
    "documents": [{"id": "str!", "title": "str!", "aliases": "list", "author": "str", "text": "str",
                   "cites": "anchors", "holder": "str", "notes": "list"}],
    "questions": [{"id": "str!", "q": "str!", "at": "point", "status": OneOf(QUESTION_STATUS), "answer": "str", "asked": "str", "settled": "str"}],
    "scenes": [{"at": "point!", "day": "int", "time": "str", "place": "str", "cast": "list", "card": "int", "summary": "str"}],
    "events": [{"at": "point!", "kind": "str!", "who": "names", "what": "str", "to": "str", "from": "str", "src": "anchor", "note": "str"}],
}
KINDS = {  # 出来事の種類 → 必須の項目
    "know": ("who", "what"), "feel": ("who", "to", "what"), "move": ("what", "to"),
    "plant": ("what",), "hint": ("what",), "payoff": ("what",), "stage": ("who", "what"),
}
THREAD_KINDS = ("plant", "hint", "payoff")
JA = {  # 決まった値の、人が読む出力での言い方
    "know": "知る", "feel": "気持ち", "move": "移る", "plant": "置く", "hint": "匂わせる", "payoff": "回収", "stage": "段階",
    "disclosed": "開示", "hinted": "示唆", "hidden": "【秘匿】",
    "not_planted": "まだ置いていない", "planted": "置いた", "paid_off": "回収済み", "overdue": "回収の予定を過ぎた",
}


def ja(value) -> str:
    return JA.get(value, value)


def reader_text(sec: dict) -> str | None:
    """秘密の読者への開き方（reader）と、その補足（reader_note）をつないだ表示。"""
    text = (ja(sec["reader"]) if sec.get("reader") else "") + (sec.get("reader_note") or "")
    return text or None


class NotWritten(ValueError):
    """時点の章（巻）がまだ本文に無い。"""


class Loader(yaml.SafeLoader):
    """「10:30」を六十進の数に、「2026-11-12」を日付にしない（文字のまま読む）。"""


_DROP = ("tag:yaml.org,2002:int", "tag:yaml.org,2002:timestamp")
Loader.yaml_implicit_resolvers = {
    k: [(t, r) for t, r in v if t not in _DROP] for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
Loader.add_implicit_resolver("tag:yaml.org,2002:int", re.compile(r"^[-+]?(?:0|[1-9][0-9_]*)$"), list("-+0123456789"))


def plain(text: str) -> str:
    """ルビ・傍点の記法と空白を外す。"""
    text = EMPH.sub(r"\1", text)
    text = RUBY.sub(r"\1", text)
    return SPACE.sub("", READING.sub("", text))


def find_conf(start: Path) -> Path:
    p = start.resolve()
    if p.is_file():
        return p
    for d in [p, *p.parents]:
        if (d / CONF_NAME).is_file():
            return d / CONF_NAME
    raise SystemExit(f"{CONF_NAME} が見つからない（{start} から上へたどった）")


class Chapter:
    def __init__(self, vol: str, vi: int, ci: int, path: Path, root: Path, ext: str):
        self.vol, self.vi, self.ci, self.path = vol, vi, ci, path
        self.id = path.name[: -len(ext)]
        self.rel = path.relative_to(root).as_posix()
        self.lines = path.read_text(encoding="utf-8").split("\n")
        self.plain = [plain(x) for x in self.lines]
        self.breaks = [i + 1 for i, x in enumerate(self.lines) if BREAK.match(x)]
        # 本文の始まりの行（frontmatter の次）。検索と照合はここから
        self.body = next((i + 2 for i, x in enumerate(self.lines[1:]) if x == "---"), 1) if self.lines[:1] == ["---"] else 1

    def body_lines(self):
        """(行番号, 元の行, 記法を外した行) を本文の分だけ。"""
        for i in range(self.body, len(self.lines) + 1):
            yield i, self.lines[i - 1], self.plain[i - 1]

    @property
    def scenes(self) -> int:
        return len(self.breaks) + 1

    def scene_of(self, line: int) -> int:
        return 1 + sum(1 for b in self.breaks if b < line)

    def matches(self, token: str) -> bool:
        return token == self.id or token in self.id.split("-")


@dataclass(frozen=True, order=True)
class Point:
    vi: int
    ci: int
    scene: int  # 0 は章の頭


@dataclass
class Hit:
    ch: Chapter
    line: int
    count: int  # 本文に何か所あったか

    @property
    def scene(self) -> int:
        return self.ch.scene_of(self.line)

    @property
    def where(self) -> str:
        return f"{self.ch.rel}:{self.line}"


class Work:
    def __init__(self, conf_path: Path):
        self.conf_path = conf_path
        self.root = conf_path.parent
        self.conf = yaml.load(conf_path.read_text(encoding="utf-8"), Loader=Loader) or {}
        self.problems: list[tuple[str, str]] = []  # (ファイル, 中身)
        self.ext = self.conf.get("ext", ".kym.txt")
        mdir = self.root / self.conf.get("manuscript", "manuscript")
        self.volumes = self.conf.get("volumes") or sorted(p.name for p in mdir.iterdir() if p.is_dir())
        self.chapters: list[Chapter] = []
        for vi, vol in enumerate(self.volumes):
            files = sorted((mdir / vol).glob(f"*{self.ext}")) if (mdir / vol).is_dir() else []
            self.chapters += [Chapter(vol, vi, ci, f, self.root, self.ext) for ci, f in enumerate(files)]
        self.ledger_dir = self.root / self.conf.get("ledger", "ledger")
        self.led = {name: self._load(self.ledger_dir / f"{name}.yaml", name) for name in GLOBAL_FILES}
        self.scenes: list[dict] = []
        self.events: list[dict] = []
        for vol in self.volumes:
            for name in VOL_FILES:
                rows = self._load(self.ledger_dir / vol / f"{name}.yaml", name)
                for i, row in enumerate(rows):
                    row["_vol"], row["_i"] = vol, i
                    getattr(self, name).append(row)
        self._index_names()
        for name in VOL_FILES:
            for row in getattr(self, name):
                try:
                    row["_pt"] = self.point(row["at"], row["_vol"])
                except (ValueError, KeyError, TypeError) as e:
                    self.problems.append((self.ledger_file(name, row["_vol"]), f"{row.get('at')}: {e}"))
        self.scenes = [s for s in self.scenes if "_pt" in s]
        self.events = [e for e in self.events if "_pt" in e]

    # --- 読み込みと形の検査 ---
    def ledger_file(self, name: str, vol: str | None = None) -> str:
        p = self.ledger_dir / vol / f"{name}.yaml" if vol else self.ledger_dir / f"{name}.yaml"
        return p.relative_to(self.root).as_posix()

    def _load(self, path: Path, name: str):
        spec = SCHEMA[name]
        empty = {} if isinstance(spec, dict) else []
        if not path.is_file():
            return empty
        rel = path.relative_to(self.root).as_posix()
        try:
            data = yaml.load(path.read_text(encoding="utf-8"), Loader=Loader)
        except yaml.YAMLError as e:
            self.problems.append((rel, f"YAML が読めない: {e}"))
            return empty
        if data is None:
            return empty
        self.problems += [(rel, e) for e in validate(data, spec, "")]
        if not isinstance(data, type(empty)):
            return empty
        return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else data

    # --- 名前 ---
    def _index_names(self):
        self.people: dict[str, str] = {}
        for c in self.characters:
            key = c.get("short") or c["name"]
            for n in [c["name"], key, *(c.get("aliases") or [])]:
                self.people[n] = key
        self.item_names = {n: i["name"] for i in self.items for n in [i["name"], *(i.get("aliases") or [])]}
        self.place_names = {n: p["name"] for p in self.places_list for n in [p["name"], *(p.get("aliases") or [])]}

    @property
    def characters(self) -> list[dict]:
        return [c for c in self.led["characters"] if isinstance(c, dict) and "name" in c]

    @property
    def items(self) -> list[dict]:
        return [i for i in self.led["items"] if isinstance(i, dict) and "name" in i]

    @property
    def places_list(self) -> list[dict]:
        return [p for p in self.led["places"].get("places") or [] if isinstance(p, dict) and "name" in p]

    @property
    def routes(self) -> list[dict]:
        return self.led["places"].get("routes") or []

    def rows(self, name: str) -> list[dict]:
        return [r for r in self.led[name] if isinstance(r, dict)]

    # --- 時点 ---
    def chapter(self, token: str, vol: str | None = None) -> Chapter:
        vol = self._vol(vol)
        for ch in self.chapters:
            if ch.vol == vol and ch.matches(token):
                return ch
        raise NotWritten(f"章 {token} が {vol} の本文に無い")

    def _vol(self, vol: str | None) -> str:
        if vol:
            if vol not in self.volumes:
                raise NotWritten(f"巻 {vol} が無い")
            return vol
        if len(self.volumes) == 1:
            return self.volumes[0]
        raise ValueError("巻が二つ以上あるので「vol1/04:3」の形で巻を付ける")

    def point(self, text, vol: str | None = None) -> Point:
        m = POINT.match(str(text))
        if not m:
            raise ValueError(f"時点「{text}」は「章:場面」の形で書く")
        ch = self.chapter(m["ch"], m["vol"] or vol)
        scene = int(m["scene"]) if m["scene"] else 0
        if scene > ch.scenes:
            raise ValueError(f"{ch.id} の場面は {ch.scenes} まで（{text}）")
        return Point(ch.vi, ch.ci, scene)

    def later_point(self, text, vol: str | None = None) -> Point | None:
        """予定の時点。章がまだ書かれていなければ None（まだ先）。"""
        try:
            return self.point(text, vol)
        except NotWritten:
            return None

    def ch_of(self, pt: Point) -> Chapter:
        return next(c for c in self.chapters if (c.vi, c.ci) == (pt.vi, pt.ci))

    def label(self, pt: Point) -> str:
        ch = self.ch_of(pt)
        head = ch.id if len(self.volumes) == 1 else f"{ch.vol}/{ch.id}"
        return f"{head}:{pt.scene}" if pt.scene else head

    def end_of(self, ch: Chapter) -> Point:
        return Point(ch.vi, ch.ci, ch.scenes)

    # --- 引用 ---
    def resolve(self, anchor: str, vol: str | None = None) -> Hit:
        """「章「引用」」を本文の行に引き直す。見つからなければ ValueError（迷子）。"""
        m = ANCHOR.match(anchor.strip())
        if not m:
            raise ValueError(f"引用「{anchor}」は「章「本文の字」」の形で書く")
        ch = self.chapter(m["ch"], m["vol"] or vol)
        quote = m["quote"]
        pq = plain(quote)
        found = [i + 1 for i, (raw, pl) in enumerate(zip(ch.lines, ch.plain)) if quote in raw or (pq and pq in pl)]
        if not found:
            raise ValueError(f"迷子: {ch.rel} に「{quote}」が無い")
        return Hit(ch, found[0], len(found))

    def anchors(self):
        """台帳の引用を (ファイル, 引用, 巻) で全部挙げる。"""
        def walk(node, spec, file, vol):
            if isinstance(spec, list) and isinstance(node, list):
                for row in node:
                    yield from walk(row, spec[0], file, vol)
            elif isinstance(spec, dict) and isinstance(node, dict):
                for k, v in node.items():
                    t = spec.get(k)
                    if t in ("anchor", "anchor!") and isinstance(v, str):
                        yield file, v, vol
                    elif t == "anchors" and isinstance(v, list):
                        yield from ((file, a, vol) for a in v if isinstance(a, str))
                    elif isinstance(t, (list, dict)):
                        yield from walk(v, t, file, vol)
        one = self.volumes[0] if len(self.volumes) == 1 else None
        for name in GLOBAL_FILES:
            yield from walk(self.led[name], SCHEMA[name], self.ledger_file(name), one)
        for name in VOL_FILES:
            for row in getattr(self, name):
                yield from walk(row, SCHEMA[name][0], self.ledger_file(name, row["_vol"]), row["_vol"])

    def ledger_text(self) -> str:
        """未登録語の照合に使う、台帳と設定集の字。"""
        # questions.yaml は作者への質問なので、そこに書いた語は登録したことにしない
        parts = [p.read_text(encoding="utf-8") for p in self.ledger_dir.rglob("*.yaml") if p.name != "questions.yaml"]
        parts += [(self.root / p).read_text(encoding="utf-8") for p in self.markdown_files()]
        return "\n".join(parts)

    def markdown_files(self) -> list[str]:
        files = list(self.conf.get("setting") or []) + list((self.conf.get("plots") or {}).values())
        return [f for f in files if (self.root / f).is_file()]


def validate(node, spec, where: str) -> list[str]:
    at = where or "先頭"
    if isinstance(spec, list):
        if not isinstance(node, list):
            return [f"{at}: 並び（- の行）で書く"]
        return [e for i, row in enumerate(node) for e in validate(row, spec[0], f"{where}[{i}]")]
    if isinstance(spec, dict):
        if not isinstance(node, dict):
            return [f"{at}: 項目（キー: 値）で書く"]
        errs = [f"{at}: 知らない項目 {k}" for k in node if k not in spec]
        errs += [f"{at}: {k} が無い" for k, t in spec.items()
                 if (t.need if isinstance(t, OneOf) else isinstance(t, str) and t.endswith("!")) and k not in node]
        for k, v in node.items():
            if k in spec and v is not None:
                errs += validate(v, spec[k], f"{where}.{k}" if where else k)
        return errs
    if isinstance(spec, OneOf):
        return [] if node in spec.values else [f"{at}: {' / '.join(spec.values)} のどれか（{node!r}）"]
    t = spec.rstrip("!")
    ok = {
        "str": isinstance(node, str), "anchor": isinstance(node, str), "point": isinstance(node, str),
        "int": isinstance(node, int) and not isinstance(node, bool), "bool": isinstance(node, bool),
        "dict": isinstance(node, dict),
        "list": isinstance(node, list) and all(isinstance(x, str) for x in node),
        "anchors": isinstance(node, list) and all(isinstance(x, str) for x in node),
        "names": isinstance(node, str) or (isinstance(node, list) and all(isinstance(x, str) for x in node)),
    }[t]
    return [] if ok else [f"{at}: {t} で書く（{node!r}）"]


def names(value) -> list[str]:
    if value is None:
        return []
    return [value] if isinstance(value, str) else list(value)
