"""Normalized activity model.

Everything downstream (habit analytics, the tree genome) works on these two
small dataclasses, so any data source -- the Strava API, a Strava bulk-export
archive, the Strava MCP connector or a synthetic demo -- only needs an adapter
that produces them.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field, asdict
from typing import Any, Iterable, Optional

RUN_SPORTS = {"Run", "TrailRun", "VirtualRun"}


@dataclass
class Activity:
    id: int
    name: str
    start: dt.datetime          # local wall-clock time of the start (naive)
    sport: str                  # Strava sport_type, e.g. Run, TrailRun, Ride
    distance_km: float = 0.0
    moving_s: int = 0
    elapsed_s: int = 0
    elev_m: float = 0.0
    workout_type: Optional[int] = None   # Strava: 1 race, 2 long run, 3 workout
    avg_hr: Optional[float] = None
    max_hr: Optional[float] = None
    effort: Optional[float] = None       # Strava relative effort (suffer score)
    kudos: int = 0
    prs: int = 0
    achievements: int = 0
    trainer: bool = False

    @property
    def is_run(self) -> bool:
        return self.sport in RUN_SPORTS

    @property
    def pace_s_per_km(self) -> Optional[float]:
        if self.distance_km <= 0.2 or self.moving_s <= 0:
            return None
        return self.moving_s / self.distance_km

    @property
    def minutes(self) -> float:
        return (self.moving_s or self.elapsed_s) / 60.0

    def to_json(self) -> dict:
        d = asdict(self)
        d["start"] = self.start.isoformat(timespec="seconds")
        return d

    @classmethod
    def from_json(cls, d: dict) -> "Activity":
        d = dict(d)
        d["start"] = dt.datetime.fromisoformat(d["start"])
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _parse_local(s: str) -> dt.datetime:
    # Strava's start_date_local looks like "2024-03-02T07:01:12Z" but is local
    # wall-clock time; drop any zone designator.
    s = s.strip().replace("Z", "")
    if "+" in s[10:]:
        s = s[: 10 + s[10:].index("+")]
    return dt.datetime.fromisoformat(s)


def from_strava_api(a: dict) -> Activity:
    """Adapt a Strava API (or Strava-API-shaped connector) activity dict."""
    sport = a.get("sport_type") or a.get("type") or "Run"
    start = a.get("start_date_local") or a.get("start_date") or a.get("start")
    dist_m = a.get("distance")
    if dist_m is None and "distance_km" in a:
        dist_km = _num(a["distance_km"])
    else:
        dist_km = _num(dist_m) / 1000.0
    wt = a.get("workout_type")
    return Activity(
        id=int(a["id"]),
        name=(a.get("name") or "").strip(),
        start=_parse_local(str(start)),
        sport=str(sport),
        distance_km=round(dist_km, 3),
        moving_s=int(_num(a.get("moving_time"))),
        elapsed_s=int(_num(a.get("elapsed_time"))),
        elev_m=round(_num(a.get("total_elevation_gain")), 1),
        workout_type=int(wt) if wt not in (None, "") else None,
        avg_hr=_num(a.get("average_heartrate"), None) if a.get("average_heartrate") else None,
        max_hr=_num(a.get("max_heartrate"), None) if a.get("max_heartrate") else None,
        effort=_num(a.get("suffer_score"), None) if a.get("suffer_score") else None,
        kudos=int(_num(a.get("kudos_count"))),
        prs=int(_num(a.get("pr_count"))),
        achievements=int(_num(a.get("achievement_count"))),
        trainer=bool(a.get("trainer")),
    )


def dedupe_sorted(acts: Iterable[Activity]) -> list[Activity]:
    by_id: dict[int, Activity] = {}
    for a in acts:
        by_id[a.id] = a
    return sorted(by_id.values(), key=lambda a: a.start)
