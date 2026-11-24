"""出来事の記録を積み上げて、ある時点の状態を出す。"""
from __future__ import annotations

from dataclasses import dataclass, field

from .work import THREAD_KINDS, Point, Work, names


@dataclass
class State:
    knows: dict[str, list[dict]] = field(default_factory=dict)  # 人物 -> [{at, what, src}]
    feels: dict[str, dict[str, dict]] = field(default_factory=dict)  # 人物 -> 相手 -> {at, what}
    holder: dict[str, str] = field(default_factory=dict)  # 持ち物 -> 持ち主・置き場所
    moves: dict[str, list[dict]] = field(default_factory=dict)  # 持ち物 -> [{at, to}]
    threads: dict[str, list[dict]] = field(default_factory=dict)  # 伏線 -> [{at, kind, src}]
    stage: dict[str, dict] = field(default_factory=dict)  # 人物 -> {at, what}
    place: dict[str, dict] = field(default_factory=dict)  # 人物 -> {at, place}

    def knows_secret(self, person: str, secret: str) -> bool:
        return any(k["what"] == secret for k in self.knows.get(person, []))

    def items_of(self, holder: str) -> list[str]:
        return [i for i, h in self.holder.items() if h == holder]


def replay(work: Work, until: Point | None = None, inclusive: bool = False) -> State:
    """until の場面の頭（inclusive なら終わり）までの状態。until が無ければ最後まで。"""
    def before(pt: Point) -> bool:
        return until is None or pt < until or (inclusive and pt == until)

    s = State()
    person = lambda n: work.people.get(n, n)  # noqa: E731
    for sec in work.rows("secrets"):
        for n in sec.get("known") or []:
            s.knows.setdefault(person(n), []).append({"at": None, "what": sec.get("id"), "src": None})
    for item in work.items:
        if item.get("holder"):
            s.holder[item["name"]] = person(item["holder"])
    for sc in work.scenes:
        if before(sc["_pt"]):
            for n in sc.get("cast") or []:
                s.place[person(n)] = {"at": sc["_pt"], "place": sc.get("place")}
    for e in sorted(work.events, key=lambda e: e["_pt"]):
        if not before(e["_pt"]):
            continue
        kind, at, what = e.get("kind"), e["_pt"], e.get("what")
        if kind == "know":
            for n in names(e.get("who")):
                s.knows.setdefault(person(n), []).append({"at": at, "what": what, "src": e.get("src")})
        elif kind == "feel":
            for n in names(e.get("who")):
                s.feels.setdefault(person(n), {})[person(e.get("to"))] = {"at": at, "what": what}
        elif kind == "move":
            item = work.item_names.get(what, what)
            s.holder[item] = person(e.get("to"))
            s.moves.setdefault(item, []).append({"at": at, "to": s.holder[item]})
        elif kind in THREAD_KINDS:
            s.threads.setdefault(what, []).append({"at": at, "kind": kind, "src": e.get("src"), "vol": e["_vol"]})
        elif kind == "stage":
            for n in names(e.get("who")):
                s.stage[person(n)] = {"at": at, "what": what}
    return s
