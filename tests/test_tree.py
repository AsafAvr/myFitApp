import datetime as dt
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from fittree import demo, habits, story, strava
from fittree.model import Activity, from_strava_api

ROOT = Path(__file__).resolve().parent.parent
AS_OF = dt.date(2026, 11, 23)


def run(day: dt.date, km=5.0, minutes=30, rid=None, **kw):
    return Activity(id=rid or int(day.strftime("%Y%m%d")) * 10 + int(km), name="Run",
                    start=dt.datetime.combine(day, dt.time(6, 30)), sport=kw.pop("sport", "Run"),
                    distance_km=km, moving_s=int(minutes * 60), elapsed_s=int(minutes * 60), **kw)


def genome(acts, **kw):
    return habits.build_genome(acts, {"id": "t", "first_name": "T"}, habits.Options(as_of=AS_OF, **kw))


def test_wood_only_grows_and_streaks_count_weeks():
    start = AS_OF - dt.timedelta(days=70)
    acts = [run(start + dt.timedelta(days=d)) for d in range(0, 71, 2)]
    g = genome(acts)
    woods = [w["wood"] for w in g["weeks"]]
    assert woods == sorted(woods), "persistence wood must never shrink"
    assert g["summary"]["streak"] == g["summary"]["weeks_active"] == len(g["weeks"])


def test_gap_breaks_streak_and_brings_winter():
    start = AS_OF - dt.timedelta(days=80)
    acts = [run(start + dt.timedelta(days=d)) for d in range(0, 40, 2)]
    g = genome(acts)
    s = g["summary"]
    assert s["streak"] == 0
    assert s["days_since_last"] >= 21
    assert s["season_label"] == "Winter"
    assert g["days"]["season"][-1] < 0.05


def test_steady_running_is_summer_and_spike_is_heatwave():
    start = AS_OF - dt.timedelta(days=90)
    steady = [run(start + dt.timedelta(days=d), km=6, minutes=36) for d in range(0, 91, 2)]
    assert genome(steady)["summary"]["season_label"] in ("Summer", "Late summer", "Spring flush")
    spike = steady + [run(AS_OF - dt.timedelta(days=d), km=14, minutes=90, rid=900 + d) for d in range(0, 7)]
    assert genome(spike)["summary"]["season_label"] == "Heatwave"


def test_beginner_is_spring_and_long_run_is_relative():
    start = AS_OF - dt.timedelta(days=12)
    acts = [run(start), run(start + dt.timedelta(days=3), km=3), run(start + dt.timedelta(days=6), km=3.5),
            run(start + dt.timedelta(days=10), km=6.5, minutes=45)]
    g = genome(acts)
    assert g["summary"]["season_label"] == "Spring flush"
    assert g["runs"][-1]["kind"] == "long"           # 6.5 km is long for this runner
    assert "First 5K" in g["runs"][0]["ms"]


def test_weekday_roots_follow_week_start():
    sunday = dt.date(2026, 11, 22)
    acts = [run(sunday - dt.timedelta(days=7 * k)) for k in range(5)]
    g = genome(acts, week_start=6)
    assert g["weekday_names"][0] == "Sun"
    assert g["roots"][0]["runs"] == 5
    assert all(r["dow"] == 0 for r in g["runs"])


def test_story_mentions_growth_and_nudges():
    g = genome(demo.synth("beginner", as_of=AS_OF))
    s = story.compose(g)
    assert "growth rings" in s["caption"] and "Next:" in s["caption"]
    assert len(s["caption"]) < 1024     # fits a Telegram photo caption


def test_strava_api_adapter_and_csv(tmp_path):
    a = from_strava_api({"id": 1, "name": "Morning Run", "sport_type": "Run", "distance": 10234.5,
                         "moving_time": 3000, "elapsed_time": 3100, "total_elevation_gain": 55,
                         "start_date_local": "2026-11-20T06:01:02Z", "workout_type": 2, "pr_count": 1})
    assert a.is_run and a.distance_km == pytest.approx(10.234, abs=1e-3) and a.start.hour == 6
    csv = tmp_path / "activities.csv"
    csv.write_text(
        "Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Moving Time,Distance,Elevation Gain\n"
        '42,"Nov 3, 2026, 4:12:44 AM",Easy,Run,1900,5.01,1800,5012.3,31\n')
    acts = strava.load_bulk_export(csv, utc_offset_hours=2)
    assert acts[0].distance_km == pytest.approx(5.012, abs=1e-3)
    assert acts[0].start.hour == 6 and acts[0].moving_s == 1800


@pytest.mark.skipif(not shutil.which("node"), reason="node not installed")
def test_js_engine_grows_deterministically(tmp_path):
    g = genome(demo.synth("seasoned", as_of=AS_OF), week_start=6)
    gp = tmp_path / "g.json"
    gp.write_text(json.dumps(g))
    script = f"""
      const FT = require({json.dumps(str(ROOT / 'web' / 'tree.js'))});
      const g = require({json.dumps(str(gp))});
      const M = FT.prepare(g);
      const out = [];
      let prevH = 0;
      for (const T of [1, 30, 120, 300, M.today]) {{
        const S = FT.grow(M, T);
        if (S.H + 1e-9 < prevH) throw new Error('tree shrank at ' + T);
        prevH = S.H;
        out.push({{T, H: S.H, twigs: S.twigs.length, leaves: S.leaves.length, fruits: S.fruits.length}});
      }}
      const a = FT.grow(M, 200), b = FT.grow(M, 200);
      if (JSON.stringify(a.leaves) !== JSON.stringify(b.leaves)) throw new Error('not deterministic');
      const last = FT.grow(M, M.today);
      const leaves = g.runs.reduce((n, r) => n + FT.leafCount(r.km), 0);
      console.log(JSON.stringify({{out, leaves, kept: last.leaves.length + last.fallen.length}}));
    """
    res = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    data = json.loads(res.stdout)
    assert data["out"][0]["twigs"] >= 1
    assert data["out"][-1]["twigs"] > data["out"][1]["twigs"]
    assert data["out"][-1]["leaves"] > 500
    assert sum(story.leaves_for(r["km"]) for r in g["runs"]) == data["leaves"]


# ---------------------------------------------------------------- Google side
from fittree import google  # noqa: E402

TCX = """<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
 <Activities><Activity Sport="{sport}"><Id>{t}</Id>
  <Lap StartTime="{t}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>{d}</DistanceMeters>
   <Track>{pts}</Track></Lap></Activity></Activities></TrainingCenterDatabase>"""


def tcx(t, sport="Running", d=5012.0, alts=(10, 11, 16, 15, 22, 30, 29, 35)):
    pts = "".join(f"<Trackpoint><Time>{t}</Time><AltitudeMeters>{a}</AltitudeMeters>"
                  f"<HeartRateBpm><Value>{150 + i}</Value></HeartRateBpm></Trackpoint>" for i, a in enumerate(alts))
    return TCX.format(sport=sport, t=t, d=d, pts=pts)


def test_takeout_zip_merges_sessions_and_tcx(tmp_path):
    import zipfile
    z = tmp_path / "takeout-20261110T124359Z-1-001.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("Takeout/Fit/All Sessions/2026-11-03T06_12_44+02_00_RUNNING.json", json.dumps({
            "fitnessActivity": "running", "startTime": "2026-11-03T04:12:44.000Z",
            "endTime": "2026-11-03T04:42:44.000Z", "duration": "1800.000s",
            "aggregate": [{"metricName": "com.google.distance.delta", "floatValue": 5012.3},
                          {"metricName": "com.google.step_count.delta", "intValue": 4800}]}))
        f.writestr("Takeout/Fit/Activities/2026-11-03T06_12_44+02_00_RUNNING.tcx", tcx("2026-11-03T04:13:01.000Z"))
        f.writestr("Takeout/Fit/Activities/2026-11-05T17_00_00+02_00_WALKING.tcx",
                   tcx("2026-11-05T15:00:00.000Z", sport="Other", d=3000))
        f.writestr("Takeout/Chrome/History.json", json.dumps({"startTime": "x", "activity": "y"}))
    acts = google.load_takeout(z, tz="Asia/Jerusalem", verbose=False)
    run_, walk = acts
    assert run_.is_run and run_.distance_km == pytest.approx(5.012, abs=1e-3)
    assert run_.start == dt.datetime(2026, 11, 3, 6, 12, 44)          # local Israel time
    assert run_.elev_m == pytest.approx(25.0) and run_.avg_hr == pytest.approx(153.5)   # from the TCX twin
    assert walk.sport == "Walk" and walk.start.hour == 17
    assert "Fit/All Sessions" in google.inspect(z)


def test_google_health_point_adapter():
    a = google.from_health_point({
        "name": "users/me/dataTypes/exercise/dataPoints/123456789",
        "exercise": {"exerciseType": "RUNNING", "displayName": "Run",
                     "interval": {"startTime": "2026-11-20T04:00:00Z", "endTime": "2026-11-20T04:40:00Z",
                                  "startUtcOffset": "7200s"},
                     "activeDuration": "2280s",
                     "metricsSummary": {"distanceMillimeters": 7_250_000, "elevationGainMillimeters": 41_000,
                                        "averageHeartRateBeatsPerMinute": 151}}})
    assert a.id == 123456789 and a.is_run and a.start == dt.datetime(2026, 11, 20, 6, 0)
    assert a.distance_km == pytest.approx(7.25) and a.elev_m == pytest.approx(41.0) and a.moving_s == 2280


def test_elevation_gain_ignores_jitter():
    assert google.elevation_gain([10, 11, 10, 12, 11, 10]) == 0
    assert google.elevation_gain([10, 20, 15, 25]) == pytest.approx(20)
