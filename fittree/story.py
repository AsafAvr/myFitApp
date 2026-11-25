"""Turns a genome into the weekly message: what grew, why, and what's next."""
from __future__ import annotations

import datetime as dt
import math

from .habits import KM_MILESTONES, STREAK_MILESTONES

FRUIT = {"easy": "🍒", "long": "🍎", "tempo": "🍊", "hill": "🫐", "race": "🌟"}
FRUIT_NAME = {"easy": "cherries (easy run)", "long": "apple (long run)",
              "tempo": "orange (fast run)", "hill": "plums (hilly run)",
              "race": "golden apple (race)"}
SEASON_EMOJI = {"Spring flush": "🌱", "Summer": "🌳", "Heatwave": "🔥", "Late summer": "🌾",
                "Autumn": "🍂", "Late autumn": "🍁", "Winter": "❄️"}


def fmt_pace(s):
    if not s:
        return "–"
    return f"{int(s // 60)}:{int(s % 60):02d}/km"


def leaves_for(km: float) -> int:
    # must match leafCount() in web/tree.js
    return max(3, min(48, round(km * 1.6)))


def compose(genome: dict) -> dict:
    s = genome.get("summary", {})
    name = genome["athlete"].get("first_name") or genome["athlete"].get("name", "Runner")
    if not s.get("runs"):
        return {"title": f"🌰 {name}'s seed is planted",
                "lines": ["No runs yet — the first run sprouts the tree."],
                "next": "Go for any run, even 15 minutes. That's the seed cracking open.",
                "caption": f"🌰 {name}'s seed is planted. First run sprouts it!"}

    today = dt.date.fromisoformat(genome["as_of"])
    week_ago = today - dt.timedelta(days=6)
    recent = [r for r in genome["runs"] if dt.date.fromisoformat(r["t"][:10]) >= week_ago]
    km7 = sum(r["km"] for r in recent)
    leaves7 = sum(leaves_for(r["km"]) for r in recent)
    weeks = genome["weeks"]
    wood_now = weeks[-1]["wood"]
    wood_then = next((w["wood"] for w in reversed(weeks)
                      if dt.date.fromisoformat(w["start"]) <= week_ago - dt.timedelta(days=1)), 0.0)
    grew = (wood_now - wood_then) / wood_then * 100 if wood_then else 100.0

    lines = []
    if recent:
        lines.append(f"Last 7 days: {len(recent)} run{'s' * (len(recent) != 1)} · {km7:.1f} km → "
                     f"{len(recent)} new twig{'s' * (len(recent) != 1)} and {leaves7} leaves")
    else:
        lines.append(f"No runs in the last 7 days — the tree is resting "
                     f"({s['days_since_last']} days since the last run)")
    lines.append(f"Trunk: {s['weeks_active']} growth rings from {s['weeks_total']} weeks "
                 f"({s['consistency'] * 100:.0f}% persistence)"
                 + (f", +{grew:.0f}% wood this week" if grew >= 1 else ""))
    pct = s["ratio"] * 100
    lines.append(f"Leaves: {SEASON_EMOJI.get(s['season_label'], '')} {s['season_label']} — "
                 f"last 7 days at {pct:.0f}% of your usual load")
    if recent:
        fruit = " · ".join(f"{FRUIT[r['kind']]} {r['km']:.1f} km "
                           f"{dt.date.fromisoformat(r['t'][:10]).strftime('%a')}" for r in recent[-5:])
        lines.append(f"Fresh fruit: {fruit}")
    if s["streak"] >= 2:
        lines.append(f"Nest: {'🥚' * min(s['streak'], 6)} {s['streak']}-week streak"
                     + (" (longest ever!)" if s["streak"] >= s["longest_streak"] and s["streak"] > 2 else ""))
    d = s["days_since_last"]
    if d <= 2:
        lines.append(f"Soil: freshly watered 💧 (last run {'today' if d == 0 else 'yesterday' if d == 1 else '2 days ago'})")
    elif d <= 7:
        lines.append(f"Soil: drying out — {d} days since the last run")
    else:
        lines.append(f"Soil: dry and cracking — {d} days without water")
    # keepsakes unlocked this week
    then = today - dt.timedelta(days=7)
    active_then = sum(1 for w in weeks if w["runs"] and dt.date.fromisoformat(w["start"]) <= then - dt.timedelta(days=6))
    for need, text in ((12, "🪵 Your initial and the year you started are now carved into the trunk"),
                       (26, "🪢 A swing now hangs from your strongest limb")):
        if active_then < need <= s["weeks_active"]:
            lines.append(text)
    new_ms = [m["label"] for m in genome["milestones"] if dt.date.fromisoformat(m["t"][:10]) >= week_ago]
    if new_ms:
        lines.append("Amber rings: ✨ " + " · ".join(new_ms))

    # ---- the nudge ---------------------------------------------------------
    target = genome.get("target_runs", 3)
    tw = s["this_week"]["runs"]
    nexts = []
    ws = genome["week_start"]
    days_left = 6 - (today.weekday() - ws) % 7
    if s["season_label"] in ("Winter", "Late autumn"):
        nexts.append("One easy 20-minute run is all it takes for new buds to appear. 🌱")
    elif s["heat"] > 0.45:
        nexts.append(f"Load is {pct:.0f}% of usual — a gentle week keeps the leaves from scorching.")
    elif s["season_label"] == "Autumn":
        nexts.append("Leaves are turning — two easy runs this week bring the green back.")
    if tw == 0 and s["streak"] >= 1 and days_left >= 0:
        egg = (f"and add egg #{s['streak'] + 1}" if s["streak"] < 6 else "and keep the nest full")
        nexts.append(f"Run once in the next {days_left + 1} day{'s' * (days_left != 0)} to keep the "
                     f"{s['streak']}-week streak alive ({egg}).")
    elif 0 < tw < target and days_left > 0:
        nexts.append(f"{target - tw} more run{'s' * (target - tw != 1)} this week makes it a full-strength branch.")
    nk = next((m for m in KM_MILESTONES if m > s["km"]), None)
    if nk and nk - s["km"] < max(25, s["avg4"]["km"] * 2):
        nexts.append(f"{nk - s['km']:.0f} km to the {nk:,} km amber ring.")
    ns = next((m for m in STREAK_MILESTONES if m > s["streak"]), None)
    if ns and s["streak"] and ns - s["streak"] <= 2:
        nexts.append(f"{ns - s['streak']} more week{'s' * (ns - s['streak'] != 1)} to a streak of {ns} weeks.")
    if not nexts:
        nexts.append("Keep the rhythm — every run is a new twig.")

    title = f"{SEASON_EMOJI.get(s['season_label'], '🌳')} {name}'s running tree — {today.strftime('%d %b %Y')}"
    caption = "\n".join([title, "", *lines, "", "Next: " + " ".join(nexts[:2])])
    return {"title": title, "lines": lines, "next": " ".join(nexts[:2]), "caption": caption}
