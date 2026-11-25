"""Synthetic athletes for developing the tree without anyone's real data."""
from __future__ import annotations

import datetime as dt
import random

from .model import Activity

NAMES = {
    "easy": ["Morning Run", "Easy miles", "Recovery jog", "Sunset run", "Lunch Run"],
    "long": ["Long run", "Friday long run", "Sea promenade long run"],
    "tempo": ["Tempo", "Intervals 6x800", "Fartlek"],
    "hill": ["Hills", "Carmel trail", "Forest trail run"],
    "race": ["Night Run 10K", "Half Marathon", "Parkrun"],
}


def synth(kind: str = "seasoned", as_of: dt.date | None = None, seed: int = 7) -> list[Activity]:
    rnd = random.Random(seed)
    today = as_of or dt.date.today()
    if kind == "beginner":
        start = today - dt.timedelta(days=37)
        base_km, growth, weekly = 3.0, 0.11, (2, 3)
        gaps = []
    else:
        start = today - dt.timedelta(days=600)
        base_km, growth, weekly = 4.0, 0.012, (2, 4)
        gaps = [(start + dt.timedelta(days=150), 19), (start + dt.timedelta(days=330), 30),
                (today - dt.timedelta(days=60), 10)]
    acts: list[Activity] = []
    aid = 10_000_000 + seed * 100_000
    d = start
    week = 0
    while d <= today:
        week_end = d + dt.timedelta(days=7)
        n = rnd.randint(*weekly)
        days = sorted(rnd.sample(range(7), n))
        fitness = base_km * (1 + growth * week) if kind == "beginner" else base_km + min(6, week * growth * 9)
        for k, off in enumerate(days):
            day = d + dt.timedelta(days=off)
            if day > today or any(g <= day < g + dt.timedelta(days=L) for g, L in gaps):
                continue
            hour = rnd.choice([5, 6, 6, 6, 7, 18, 19])
            kindr = "easy"
            km = fitness * rnd.uniform(0.75, 1.15)
            elev = km * rnd.uniform(2, 9)
            pace = rnd.gauss(345 if kind == "seasoned" else 400, 15)
            if k == len(days) - 1 and n >= 3 and rnd.random() < 0.8:
                kindr, km = "long", fitness * rnd.uniform(1.5, 2.3)
                pace += 20
            elif rnd.random() < 0.18 and week > 3:
                kindr, pace = "tempo", pace * 0.88
            elif rnd.random() < 0.15:
                kindr, elev = "hill", km * rnd.uniform(25, 45)
                pace += 40
            if kind == "seasoned" and week in (40, 70) and k == 0:
                kindr, km, pace = "race", (10.0 if week == 40 else 21.1), pace * 0.9
            aid += 1
            acts.append(Activity(
                id=aid, name=rnd.choice(NAMES[kindr]),
                start=dt.datetime.combine(day, dt.time(hour, rnd.randint(0, 59))),
                sport="TrailRun" if kindr == "hill" and rnd.random() < 0.5 else "Run",
                distance_km=round(km, 2), moving_s=int(km * pace), elapsed_s=int(km * pace * 1.05),
                elev_m=round(elev), workout_type=1 if kindr == "race" else (2 if kindr == "long" else 0),
                avg_hr=round(rnd.gauss(152, 6)), kudos=rnd.randint(0, 9),
                prs=rnd.choice([0, 0, 0, 0, 1, 2]) if kindr in ("race", "tempo", "long") else 0,
                achievements=rnd.choice([0, 0, 1]),
            ))
        # other habits, each with its own rhythm (and lapses), for the valley
        total_weeks = (today - start).days // 7 + 1
        frac = week / max(1, total_weeks)
        plan = [("Walk", 2, 0.7, frac > 0.1),
                ("Yoga", 1, 0.75, frac > 0.55 if kind == "seasoned" else True),
                ("Ride", 1, 0.8, 0.2 < frac < 0.6 or frac > 0.9) if kind == "seasoned" else ("Ride", 0, 0, False),
                ("Swim", 1, 0.65, d.month in (6, 7, 8, 9)) if kind == "seasoned" else ("Swim", 0, 0, False),
                ("WeightTraining", 2, 0.6, frac > 0.35 and not (0.7 < frac < 0.78)) if kind == "seasoned" else ("WeightTraining", 0, 0, False)]
        for sport, per_week, p, on in plan:
            if not on:
                continue
            for _ in range(per_week):
                if rnd.random() > p:
                    continue
                day = d + dt.timedelta(days=rnd.randint(0, 6))
                if day > today:
                    continue
                aid += 1
                acts.append(Activity(id=aid, name=sport, start=dt.datetime.combine(day, dt.time(17, rnd.randint(0, 59))),
                                     sport=sport, distance_km=0, moving_s=rnd.randint(1800, 4800)))
        d = week_end
        week += 1
    return acts
