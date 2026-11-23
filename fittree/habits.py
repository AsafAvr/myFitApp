"""Running-habit analytics -> the tree's *genome*.

This module is the single source of truth for "what does the tree mean".
The browser engine (web/tree.js) only does botany and rendering; every
number that shapes the tree is computed here, from the runs:

  trunk girth & height  <- persistence "wood": every week you run adds a
                           growth ring; consecutive weeks (streaks) add more
  roots                 <- weekday rhythm: one root per weekday, as thick as
                           the share of your runs that land on that day
  limbs                 <- calendar months; long & thick when the month's
                           habit was strong, a dormant bud when you skipped
  branches              <- weeks along each month's limb, sized by strength
  twigs                 <- individual runs, placed by weekday, as long as the
                           run, kinked by hills, lifted by pace
  leaves                <- ~1.5 leaves per km; colour = the season computed
                           from your last weeks (acute vs chronic load)
  fruit                 <- your latest runs, kind by run type
  blossoms              <- runs with Strava PRs / achievements
  amber rings           <- milestones (first 10k, 100 km, ...)
  nest & eggs           <- current weekly streak
  meadow flowers        <- cross-training (rides, swims, walks, workouts)
  sky                   <- the time of day you usually run
"""
from __future__ import annotations

import datetime as dt
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Optional

from .model import Activity

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DIST_MILESTONES = [(5, "First 5K"), (10, "First 10K"), (15, "First 15K"),
                   (21.0975, "First half marathon"), (30, "First 30K"),
                   (42.195, "First marathon")]
KM_MILESTONES = [10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000]
RUN_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 365, 500, 750, 1000]
STREAK_MILESTONES = [4, 8, 12, 16, 26, 39, 52, 78, 104]


@dataclass
class Options:
    as_of: Optional[dt.date] = None
    week_start: int = 0            # 0 = Monday ... 6 = Sunday (Israel: 6)
    target_runs: int = 3           # runs per week that count as a "full" week
    include_names: bool = True     # set False to keep run titles private


def _clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def _smooth(e0, e1, x):
    t = _clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def _interp(table, x):
    if x <= table[0][0]:
        return table[0][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return table[-1][1]


# ratio of acute (7 d) to chronic (28 d) load -> season 0..1
#   0 winter (bare) .25 autumn .5 late summer .75 summer 1 spring flush
SEASON_BY_RATIO = [(0.0, 0.12), (0.3, 0.22), (0.6, 0.45), (0.85, 0.72),
                   (1.0, 0.80), (1.25, 1.0)]


def season_label(s: float, heat: float, dormant_days: int) -> str:
    if dormant_days >= 21 or s < 0.08:
        return "Winter"
    if s < 0.3:
        return "Late autumn"
    if s < 0.5:
        return "Autumn"
    if s < 0.68:
        return "Late summer"
    if heat > 0.45:
        return "Heatwave"
    if s > 0.9:
        return "Spring flush"
    return "Summer"


def season_from_load(acute_min: float, chronic_weekly_min: float, dormant_days: int,
                     history_days: int) -> tuple[float, float, float]:
    """Returns (season 0..1, heat 0..1, ratio)."""
    if chronic_weekly_min <= 1:
        ratio = 1.0 if acute_min > 0 else 0.0
    else:
        ratio = acute_min / chronic_weekly_min
    s = _interp(SEASON_BY_RATIO, ratio)
    if history_days < 14 and acute_min > 0:
        s = max(s, 0.92)               # a brand-new habit is spring
    s *= 1.0 - _smooth(5, 21, dormant_days)   # leaves fall when you stop
    heat = _clamp((ratio - 1.35) / 0.6) if history_days >= 21 else 0.0
    return round(s, 3), round(heat, 3), round(ratio, 3)


def week_start_of(d: dt.date, week_start: int) -> dt.date:
    return d - dt.timedelta(days=(d.weekday() - week_start) % 7)


def classify(run: Activity, history: list[Activity]) -> tuple[str, dict]:
    """Kind of fruit a run bears, judged against the athlete's own recent
    history (so a beginner's 6 km can already be a 'long run')."""
    recent = [h for h in history if (run.start - h.start).days <= 70 and h.distance_km > 0.5]
    dists = [h.distance_km for h in recent] or [run.distance_km]
    paces = [h.pace_s_per_km for h in recent if h.pace_s_per_km] or []
    med_d = statistics.median(dists)
    med_p = statistics.median(paces) if paces else None
    pace = run.pace_s_per_km
    epk = run.elev_m / run.distance_km if run.distance_km > 0.5 else 0
    flags = {
        "race": run.workout_type == 1,
        "long": run.workout_type == 2 or run.distance_km >= 15
                or (len(recent) >= 2 and run.distance_km >= max(5.0, 1.4 * med_d)),
        "fast": run.workout_type == 3 or bool(
            med_p and pace and len(paces) >= 3 and run.distance_km >= 3 and pace <= 0.93 * med_p),
        "hill": run.sport == "TrailRun" or epk >= 18,
    }
    for k in ("race", "long", "hill", "fast"):
        if flags[k]:
            return {"fast": "tempo"}.get(k, k), flags
    return "easy", flags


def build_genome(acts: list[Activity], athlete: dict, opts: Options | None = None) -> dict:
    opts = opts or Options()
    today = opts.as_of or dt.date.today()
    acts = sorted([a for a in acts if a.start.date() <= today], key=lambda a: a.start)
    runs = [a for a in acts if a.is_run and (a.distance_km > 0.3 or a.minutes > 5)]
    others = [a for a in acts if not a.is_run]
    ws = opts.week_start

    genome: dict = {
        "version": 2,
        "athlete": athlete,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "as_of": today.isoformat(),
        "week_start": ws,
        "weekday_names": [WEEKDAYS[(ws + i) % 7] for i in range(7)],
        "target_runs": opts.target_runs,
    }
    if not runs:
        genome.update(runs=[], weeks=[], months=[], days={}, others=[], milestones=[],
                      summary={"runs": 0}, roots=[], sky={"period": "morning"})
        return genome

    first_day = runs[0].start.date()
    w0 = week_start_of(first_day, ws)
    n_weeks = (week_start_of(today, ws) - w0).days // 7 + 1

    # ---- runs (+ rolling classification and milestones) -------------------
    run_rows = []
    milestones = []
    cum_km = 0.0
    km_ms = iter(KM_MILESTONES)
    next_km = next(km_ms)
    run_ms = iter(RUN_MILESTONES)
    next_rc = next(run_ms)
    dist_done = set()
    for i, r in enumerate(runs):
        kind, flags = classify(r, runs[:i])
        cum_km += r.distance_km
        ms = []
        if i == 0:
            ms.append("First run")
        for thr, label in DIST_MILESTONES:
            if label not in dist_done and r.distance_km >= thr * 0.985:
                dist_done.add(label)
                ms.append(label)
        while next_km and cum_km >= next_km:
            ms.append(f"{next_km:,} km total")
            next_km = next(km_ms, None)
        while next_rc and i + 1 >= next_rc:
            ms.append(f"{next_rc} runs")
            next_rc = next(run_ms, None)
        wk = (week_start_of(r.start.date(), ws) - w0).days // 7
        row = {
            "id": r.id,
            "t": r.start.isoformat(timespec="minutes"),
            "wk": wk,
            "dow": (r.start.weekday() - ws) % 7,
            "km": round(r.distance_km, 2),
            "min": round(r.minutes, 1),
            "elev": round(r.elev_m),
            "pace": round(r.pace_s_per_km) if r.pace_s_per_km else None,
            "hr": round(r.avg_hr) if r.avg_hr else None,
            "kind": kind,
            "flags": [k for k, v in flags.items() if v],
            "pr": r.prs,
            "ach": r.achievements,
            "kudos": r.kudos,
            "sport": r.sport,
        }
        if opts.include_names:
            row["name"] = r.name
        if ms:
            row["ms"] = ms
            for m in ms:
                milestones.append({"t": row["t"], "label": m, "run": r.id})
        run_rows.append(row)

    # ---- daily load -> season series (one value per day) -------------------
    n_days = (today - first_day).days + 1
    day_min = [0.0] * n_days
    day_km = [0.0] * n_days
    for r in runs:
        k = (r.start.date() - first_day).days
        day_min[k] += r.minutes
        day_km[k] += r.distance_km
    season, heat, ratio, dorm = [], [], [], []
    last_run_day = -10_000
    for k in range(n_days):
        if day_min[k] > 0:
            last_run_day = k
        # acute: last 10 days scaled to a week; chronic: last 42 days
        acute = sum(day_min[max(0, k - 9): k + 1]) * 0.7
        win = min(42, k + 1)
        chronic_weekly = sum(day_min[max(0, k - 41): k + 1]) / max(win, 7) * 7
        d = k - last_run_day
        s, h, rr = season_from_load(acute, chronic_weekly, d, k + 1)
        # trees change colour slowly: ease toward the target season
        if season:
            s = round(season[-1] + (s - season[-1]) * (0.35 if s < season[-1] else 0.6), 3)
        season.append(s)
        heat.append(h)
        ratio.append(rr)
        dorm.append(d)

    # ---- weeks: strength, streak, persistence wood ------------------------
    weeks = []
    by_week: dict[int, list[Activity]] = defaultdict(list)
    for r, row in zip(runs, run_rows):
        by_week[row["wk"]].append(r)
    wood = 0.0
    streak = 0
    longest = 0
    active_km_hist: list[float] = []
    for w in range(n_weeks):
        ws_date = w0 + dt.timedelta(days=7 * w)
        wr = by_week.get(w, [])
        km = sum(r.distance_km for r in wr)
        mins = sum(r.minutes for r in wr)
        if wr:
            base = statistics.mean(active_km_hist[-8:]) if active_km_hist else km
            freq = min(1.0, len(wr) / opts.target_runs)
            vol = min(1.0, km / max(base, 1.0))
            strength = 0.6 * freq + 0.4 * vol
            streak += 1
            active_km_hist.append(km)
        else:
            strength = 0.0
            # the current week is still open: don't break the streak yet
            if w < n_weeks - 1:
                streak = 0
        longest = max(longest, streak)
        wood += strength * (1 + 0.06 * min(streak, 10))
        weeks.append({
            "i": w,
            "start": ws_date.isoformat(),
            "runs": len(wr),
            "km": round(km, 2),
            "min": round(mins, 1),
            "elev": round(sum(r.elev_m for r in wr)),
            "strength": round(strength, 3),
            "streak": streak,
            "wood": round(wood, 3),
        })

    # ---- months (limbs) -----------------------------------------------------
    months = []
    m_cursor = dt.date(first_day.year, first_day.month, 1)
    while m_cursor <= today:
        nxt = dt.date(m_cursor.year + (m_cursor.month == 12), m_cursor.month % 12 + 1, 1)
        mr = [r for r in runs if m_cursor <= r.start.date() < nxt]
        wk_ids = sorted({(week_start_of(r.start.date(), ws) - w0).days // 7 for r in mr})
        months.append({
            "key": m_cursor.strftime("%Y-%m"),
            "label": m_cursor.strftime("%b %Y"),
            "start": m_cursor.isoformat(),
            "runs": len(mr),
            "km": round(sum(r.distance_km for r in mr), 1),
            "active_weeks": len(wk_ids),
        })
        m_cursor = nxt

    # ---- weekday roots & time-of-day sky ------------------------------------
    roots = []
    for i in range(7):
        rr_ = [row for row in run_rows if row["dow"] == i]
        roots.append({"day": genome["weekday_names"][i], "runs": len(rr_),
                      "km": round(sum(x["km"] for x in rr_), 1)})
    hours = Counter(r.start.hour for r in runs)
    periods = {"dawn": range(4, 7), "morning": range(7, 11), "midday": range(11, 15),
               "afternoon": range(15, 18), "evening": range(18, 21)}
    pcount = {p: sum(hours[h] for h in rng) for p, rng in periods.items()}
    pcount["night"] = sum(hours[h] for h in list(range(21, 24)) + list(range(0, 4)))
    period = max(pcount, key=pcount.get)

    # ---- cross-training (meadow) -------------------------------------------
    other_rows = [{"t": a.start.isoformat(timespec="minutes"), "sport": a.sport,
                   "min": round(a.minutes)} for a in others if a.start.date() >= first_day]

    # ---- summary -----------------------------------------------------------
    cur = weeks[-1]
    prev = weeks[-2] if len(weeks) > 1 else None
    current_streak = cur["streak"] if cur["runs"] else (prev["streak"] if prev else 0)
    active_weeks = sum(1 for w in weeks if w["runs"])
    last4 = weeks[-5:-1] if len(weeks) > 4 else weeks[:-1] or weeks
    paces5 = [r.pace_s_per_km for r in runs if r.distance_km >= 4.5 and r.pace_s_per_km]
    summary = {
        "runs": len(runs),
        "km": round(sum(r.distance_km for r in runs), 1),
        "hours": round(sum(r.minutes for r in runs) / 60, 1),
        "elev": round(sum(r.elev_m for r in runs)),
        "first_run": first_day.isoformat(),
        "last_run": runs[-1].start.isoformat(timespec="minutes"),
        "days_since_last": (today - runs[-1].start.date()).days,
        "weeks_total": n_weeks,
        "weeks_active": active_weeks,
        "consistency": round(active_weeks / n_weeks, 3),
        "streak": current_streak,
        "longest_streak": longest,
        "this_week": {"runs": cur["runs"], "km": cur["km"]},
        "avg4": {"runs": round(statistics.mean(w["runs"] for w in last4), 2),
                 "km": round(statistics.mean(w["km"] for w in last4), 1)},
        "longest_run_km": round(max(r.distance_km for r in runs), 2),
        "best_pace": round(min(paces5)) if paces5 else None,
        "wood": round(wood, 2),
        "season": season[-1],
        "heat": heat[-1],
        "ratio": ratio[-1],
        "season_label": season_label(season[-1], heat[-1], dorm[-1]),
        "sky": period,
        "strongest_day": max(roots, key=lambda x: (x["runs"], x["km"]))["day"],
        "kinds": dict(Counter(r["kind"] for r in run_rows)),
        "cross_training": len(other_rows),
    }

    genome.update(
        first_day=first_day.isoformat(),
        runs=run_rows,
        weeks=weeks,
        months=months,
        days={"season": season, "heat": heat, "ratio": ratio, "km": [round(x, 2) for x in day_km]},
        roots=roots,
        sky={"period": period, "hist": [hours.get(h, 0) for h in range(24)]},
        others=other_rows,
        milestones=milestones,
        summary=summary,
    )
    return genome


def genome_as_of(acts: list[Activity], athlete: dict, as_of: dt.date, opts: Options) -> dict:
    o = Options(as_of=as_of, week_start=opts.week_start, target_runs=opts.target_runs,
                include_names=opts.include_names)
    return build_genome(acts, athlete, o)
