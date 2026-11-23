"""Google-side data sources (no Strava subscription needed).

* ``load_takeout``   — a Google Takeout archive (.zip or unpacked folder) of
  Google Fit. Reads per-workout TCX files (Fit "Activities") and per-session
  JSON (Fit "All Sessions"), merging the two when they describe the same run.
  Also accepts loose .tcx files, e.g. exported from the Google Health app.
* ``inspect``        — prints what an archive contains, to adapt quickly if
  Google renames folders.
* ``GoogleHealthClient`` — the Google Health API (health.googleapis.com/v4),
  Google's cloud successor to the Google Fit REST API. Each person grants
  read access once through Google's consent screen ("asking permission");
  a refresh token then lets the weekly job read new workouts.

Stdlib only, like strava.py.
"""
from __future__ import annotations

import datetime as dt
import http.server
import io
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path
from typing import Iterable, Iterator, Optional

from .model import Activity

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

DEFAULT_TZ = "Asia/Jerusalem"


# --------------------------------------------------------------------------
# sport names -> Strava-style sport_type used by the rest of fittree
# --------------------------------------------------------------------------

def sport_from(name: str) -> tuple[str, bool]:
    """Returns (sport, is_treadmill) for Fit / Health / TCX activity names."""
    n = (name or "").lower().replace("-", "_").replace(" ", "_")
    if "run" in n or "jog" in n:
        if "trail" in n:
            return "TrailRun", False
        return "Run", ("treadmill" in n or "indoor" in n)
    for key, sport in (("walk", "Walk"), ("hik", "Hike"), ("bik", "Ride"), ("cycl", "Ride"),
                       ("swim", "Swim"), ("yoga", "Yoga"), ("pilates", "Pilates"), ("row", "Rowing"),
                       ("strength", "WeightTraining"), ("weight", "WeightTraining"), ("crossfit", "Crossfit"),
                       ("elliptical", "Elliptical")):
        if key in n:
            return sport, False
    return "Workout", False


def _local(t_utc: dt.datetime, tz: str, offset_s: Optional[float] = None) -> dt.datetime:
    if offset_s is not None:
        return (t_utc + dt.timedelta(seconds=offset_s)).replace(tzinfo=None)
    if ZoneInfo is not None:
        try:
            return t_utc.astimezone(ZoneInfo(tz)).replace(tzinfo=None)
        except Exception:
            pass
    return (t_utc + dt.timedelta(hours=2)).replace(tzinfo=None)


def _parse_utc(s: str) -> dt.datetime:
    s = s.strip().replace("Z", "+00:00")
    m = re.match(r"(.*\.\d{6})\d+(.*)", s)       # trim nanoseconds
    if m:
        s = m.group(1) + m.group(2)
    t = dt.datetime.fromisoformat(s)
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def _dur_s(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s.endswith("s"):
        s = s[:-1]
    try:
        return float(s)
    except ValueError:
        return 0.0


def _stable_id(start_utc: dt.datetime) -> int:
    return int(start_utc.timestamp())


def elevation_gain(alts: list[float], threshold: float = 3.0) -> float:
    """Climb with hysteresis, so GPS altitude jitter isn't counted."""
    gain, ref = 0.0, None
    for a in alts:
        if ref is None:
            ref = a
        elif a - ref >= threshold:
            gain += a - ref
            ref = a
        elif ref - a >= threshold:
            ref = a
    return gain


# --------------------------------------------------------------------------
# TCX
# --------------------------------------------------------------------------

def parse_tcx(data: bytes, tz: str = DEFAULT_TZ, name: str = "") -> list[Activity]:
    root = ET.fromstring(data)
    ns = {"t": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
    q = (lambda tag: f"t:{tag}") if ns else (lambda tag: tag)
    out = []
    for act in root.iter(f"{{{ns['t']}}}Activity" if ns else "Activity"):
        laps = act.findall(q("Lap"), ns)
        if not laps:
            continue
        start = _parse_utc(laps[0].get("StartTime") or act.findtext(q("Id"), "", ns))
        secs = sum(float(l.findtext(q("TotalTimeSeconds"), "0", ns) or 0) for l in laps)
        dist = sum(float(l.findtext(q("DistanceMeters"), "0", ns) or 0) for l in laps)
        alts, hrs = [], []
        for tp in act.iter(f"{{{ns['t']}}}Trackpoint" if ns else "Trackpoint"):
            a = tp.findtext(q("AltitudeMeters"), None, ns)
            if a:
                alts.append(float(a))
            h = tp.find(f"{q('HeartRateBpm')}/{q('Value')}", ns)
            if h is not None and h.text:
                hrs.append(float(h.text))
        if not dist:   # some exporters only fill trackpoint distances
            ds = [float(x.text) for x in act.iter(f"{{{ns['t']}}}DistanceMeters" if ns else "DistanceMeters") if x.text]
            dist = max(ds) if ds else 0.0
        sport, treadmill = sport_from(act.get("Sport", "") + " " + name)
        out.append(Activity(
            id=_stable_id(start), name=act.findtext(q("Notes"), "", ns) or _default_name(sport, start, tz),
            start=_local(start, tz), sport=sport, distance_km=round(dist / 1000, 3),
            moving_s=int(secs), elapsed_s=int(secs), elev_m=round(elevation_gain(alts), 1),
            avg_hr=round(sum(hrs) / len(hrs), 1) if hrs else None, max_hr=max(hrs) if hrs else None,
            trainer=treadmill,
        ))
    return out


def _default_name(sport: str, start_utc: dt.datetime, tz: str) -> str:
    h = _local(start_utc, tz).hour
    part = "Morning" if 4 <= h < 11 else "Lunch" if h < 14 else "Afternoon" if h < 18 else "Evening" if h < 21 else "Night"
    return f"{part} {'Run' if 'Run' in sport else sport}"


# --------------------------------------------------------------------------
# Fit session JSON ("All Sessions")
# --------------------------------------------------------------------------

_OFFSET_IN_NAME = re.compile(r"([+-])(\d{2})_?(\d{2})_")


def _offset_from_filename(fname: str) -> Optional[float]:
    m = _OFFSET_IN_NAME.search(Path(fname).name)
    if not m:
        return None
    sign = 1 if m.group(1) == "+" else -1
    return sign * (int(m.group(2)) * 3600 + int(m.group(3)) * 60)


def parse_session_json(obj: dict, tz: str = DEFAULT_TZ, fname: str = "") -> Optional[Activity]:
    """A Fit session: fitnessActivity/startTime/endTime/duration + aggregates
    of {metricName, floatValue|intValue}. Tolerant to naming variants."""
    if "activityName" in obj and "logId" in obj:          # Fitbit / Google Health export
        return parse_fitbit_exercise(obj, tz)
    kind = obj.get("fitnessActivity") or obj.get("activityType") or obj.get("activity") or obj.get("exerciseType")
    start = obj.get("startTime") or obj.get("start_time") or obj.get("start")
    if not (kind and start):
        return None
    t0 = _parse_utc(str(start))
    end = obj.get("endTime") or obj.get("end_time")
    secs = _dur_s(obj.get("duration")) or ((_parse_utc(str(end)) - t0).total_seconds() if end else 0)
    metrics: dict[str, float] = {}
    for ag in obj.get("aggregate", []) or []:
        v = ag.get("floatValue", ag.get("intValue", ag.get("value")))
        if v is not None:
            metrics[str(ag.get("metricName", ""))] = float(v)
    dist = next((v for k, v in metrics.items() if "distance" in k), 0.0)
    active = next((v for k, v in metrics.items() if "active_minutes" in k), 0.0)
    sport, treadmill = sport_from(str(kind))
    moving = int(active * 60) if active and active * 60 <= secs * 1.05 and sport in ("Run", "TrailRun") else int(secs)
    return Activity(
        id=_stable_id(t0), name=obj.get("name") or obj.get("description") or _default_name(sport, t0, tz),
        start=_local(t0, tz, _offset_from_filename(fname)), sport=sport, distance_km=round(dist / 1000, 3),
        moving_s=moving or int(secs), elapsed_s=int(secs), trainer=treadmill,
    )


def parse_fitbit_exercise(o: dict, tz: str = DEFAULT_TZ) -> Optional[Activity]:
    """Fitbit-style exercise log (Takeout 'Fitbit/Global Export Data/exercise-*.json'):
    local startTime 'MM/DD/YY HH:MM:SS', durations in ms, distance in distanceUnit."""
    try:
        start = dt.datetime.strptime(o["startTime"], "%m/%d/%y %H:%M:%S")
    except (KeyError, ValueError):
        return None
    unit = str(o.get("distanceUnit", "Kilometer")).lower()
    dist = float(o.get("distance") or 0) * (1.609344 if unit.startswith("mile") else 1.0)
    sport, treadmill = sport_from(str(o.get("activityName", "")))
    dur = float(o.get("activeDuration") or o.get("duration") or 0) / 1000
    elev = float(o.get("elevationGain") or 0) * (0.3048 if unit.startswith("mile") else 1.0)
    return Activity(id=int(o["logId"]), name=str(o.get("activityName") or sport), start=start, sport=sport,
                    distance_km=round(dist, 3), moving_s=int(dur), elapsed_s=int(float(o.get("duration") or 0) / 1000),
                    elev_m=round(elev, 1), avg_hr=o.get("averageHeartRate"), trainer=treadmill)


# --------------------------------------------------------------------------
# Takeout archive
# --------------------------------------------------------------------------

def _iter_files(src: Path) -> Iterator[tuple[str, bytes]]:
    if src.is_dir():
        for p in sorted(src.rglob("*")):
            if p.is_file():
                yield str(p.relative_to(src)), p.read_bytes()
    elif zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            for info in z.infolist():
                if not info.is_dir():
                    yield info.filename, z.read(info)
    else:
        yield src.name, src.read_bytes()


def _is_fit_path(name: str) -> bool:
    n = name.lower()
    return n.endswith(".tcx") or ("fit" in n and n.endswith(".json") and "all data" not in n
                                  and "raw_" not in n)


def load_takeout(src: str | Path, tz: str = DEFAULT_TZ, verbose: bool = True) -> list[Activity]:
    src = Path(src)
    loose = src.is_file() and not zipfile.is_zipfile(src)
    tcx, sessions = [], []
    for name, data in _iter_files(src):
        if not (loose or _is_fit_path(name)):
            continue
        try:
            if name.lower().endswith(".tcx"):
                tcx += parse_tcx(data, tz, Path(name).stem)
            elif name.lower().endswith(".json"):
                obj = json.loads(data)
                for o in (obj if isinstance(obj, list) else [obj]):
                    if isinstance(o, dict):
                        a = parse_session_json(o, tz, name)
                        if a:
                            sessions.append(a)
        except (ET.ParseError, json.JSONDecodeError, ValueError, KeyError) as e:
            if verbose:
                print(f"  skipped {name}: {e}")
    merged = merge(sessions, tcx)
    if verbose:
        runs = sum(a.is_run for a in merged)
        print(f"  takeout: {len(sessions)} sessions + {len(tcx)} TCX workouts -> {len(merged)} activities ({runs} runs)")
    return merged


def merge(sessions: list[Activity], tcx: list[Activity]) -> list[Activity]:
    """Sessions carry Fit's own totals; TCX adds elevation and heart rate.
    Same workout = starts within 3 minutes of each other."""
    out = {a.id: a for a in sessions}
    by_time = sorted(sessions, key=lambda a: a.start)
    for t in tcx:
        twin = next((s for s in by_time if abs((s.start - t.start).total_seconds()) <= 180), None)
        if twin:
            twin.elev_m = twin.elev_m or t.elev_m
            twin.avg_hr = twin.avg_hr or t.avg_hr
            twin.max_hr = twin.max_hr or t.max_hr
            if not twin.distance_km and t.distance_km:
                twin.distance_km = t.distance_km
        else:
            out[t.id] = t
    return sorted(out.values(), key=lambda a: a.start)


def inspect(src: str | Path, limit: int = 12) -> str:
    """Summarise an archive: top folders, file types, and a sample Fit JSON."""
    src = Path(src)
    folders, exts, sample = Counter(), Counter(), None
    for name, data in _iter_files(src):
        parts = Path(name).parts
        folders["/".join(parts[:3]) if len(parts) > 3 else "/".join(parts[:-1]) or "."] += 1
        exts[Path(name).suffix.lower()] += 1
        if sample is None and _is_fit_path(name) and name.lower().endswith(".json") and len(data) < 50_000:
            try:
                obj = json.loads(data)
                sample = (name, json.dumps(obj, indent=1)[:1200])
            except json.JSONDecodeError:
                pass
    lines = ["folders (files):"] + [f"  {f}  ({n})" for f, n in folders.most_common(limit)]
    lines += ["types: " + ", ".join(f"{e or '-'}×{n}" for e, n in exts.most_common(8))]
    if sample:
        lines += [f"sample {sample[0]}:", sample[1]]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Google Health API (cloud, OAuth consent per person)
# --------------------------------------------------------------------------

HEALTH_API = "https://health.googleapis.com/v4"
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
HEALTH_SCOPES = ["https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"]


class GoogleError(RuntimeError):
    pass


def _post(url: str, data: dict) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise GoogleError(f"{url} -> HTTP {e.code}: {e.read()[:400]!r}") from e


def google_authorize_url(client_id: str, redirect_uri: str) -> str:
    return GOOGLE_AUTH + "?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": " ".join(HEALTH_SCOPES), "access_type": "offline", "prompt": "consent",
        "include_granted_scopes": "true",
    })


def google_exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    return _post(GOOGLE_TOKEN, {"client_id": client_id, "client_secret": client_secret, "code": code,
                                "redirect_uri": redirect_uri, "grant_type": "authorization_code"})


def google_capture_code(client_id: str, port: int = 8766, open_browser: bool = True) -> tuple[str, str]:
    redirect = f"http://127.0.0.1:{port}/"
    url = google_authorize_url(client_id, redirect)
    holder: dict = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            holder["code"] = (q.get("code") or [""])[0]
            holder["error"] = (q.get("error") or [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>🌱 Google Health connected. You can close this tab.</h2>".encode())

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", port), H)
    t = threading.Thread(target=srv.handle_request, daemon=True)
    t.start()
    print(f"\nOpen this link and allow access:\n\n  {url}\n")
    if open_browser:
        webbrowser.open(url)
    t.join(timeout=600)
    srv.server_close()
    if not holder.get("code"):
        raise GoogleError(f"No authorization code received ({holder.get('error') or 'timeout'}).")
    return holder["code"], redirect


class GoogleHealthClient:
    def __init__(self, client_id=None, client_secret=None, refresh_token=None, access_token=None):
        self.client_id, self.client_secret, self.refresh_token = client_id, client_secret, refresh_token
        self._access = access_token
        self._exp = time.time() + 3000 if access_token else 0

    @classmethod
    def from_env(cls, key: str) -> "GoogleHealthClient":
        k = key.upper()
        return cls(os.getenv("GOOGLE_CLIENT_ID"), os.getenv("GOOGLE_CLIENT_SECRET"),
                   os.getenv(f"GOOGLE_REFRESH_TOKEN_{k}"), os.getenv(f"GOOGLE_ACCESS_TOKEN_{k}"))

    @property
    def configured(self) -> bool:
        return bool(self._access or (self.client_id and self.client_secret and self.refresh_token))

    def token(self) -> str:
        if self._access and time.time() < self._exp - 60:
            return self._access
        if not (self.client_id and self.client_secret and self.refresh_token):
            if self._access:
                return self._access
            raise GoogleError("Google credentials missing: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
                              "GOOGLE_REFRESH_TOKEN_<ATHLETE>.")
        tok = _post(GOOGLE_TOKEN, {"client_id": self.client_id, "client_secret": self.client_secret,
                                   "refresh_token": self.refresh_token, "grant_type": "refresh_token"})
        self._access, self._exp = tok["access_token"], time.time() + float(tok.get("expires_in", 3600))
        return self._access

    def get(self, path: str, **params) -> dict:
        url = f"{HEALTH_API}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.token()}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read()[:400]
            if b"ACCOUNT_NOT_LINKED" in body:
                raise GoogleError("Google Health isn't linked yet: open the Google Health app on the phone "
                                  "and sign in once, then retry.") from e
            raise GoogleError(f"GET {path} -> HTTP {e.code}: {body!r}") from e

    def exercises(self, since: Optional[dt.date] = None, tz: str = DEFAULT_TZ) -> list[Activity]:
        since = since or dt.date(2015, 1, 1)
        flt = f'exercise.interval.civil_start_time >= "{since.isoformat()}T00:00:00"'
        out, page = [], None
        while True:
            params = {"filter": flt, "pageSize": 200}
            if page:
                params["pageToken"] = page
            res = self.get("/users/me/dataTypes/exercise/dataPoints", **params)
            points = res.get("dataPoints") or next((v for v in res.values() if isinstance(v, list)), [])
            out += [a for a in (from_health_point(p, tz) for p in points) if a]
            page = res.get("nextPageToken")
            if not page:
                return out


def from_health_point(p: dict, tz: str = DEFAULT_TZ) -> Optional[Activity]:
    ex = p.get("exercise") or p
    iv = ex.get("interval") or {}
    if not iv.get("startTime"):
        return None
    t0 = _parse_utc(iv["startTime"])
    t1 = _parse_utc(iv["endTime"]) if iv.get("endTime") else t0
    off = _dur_s(iv["startUtcOffset"]) if iv.get("startUtcOffset") is not None else None
    ms = ex.get("metricsSummary") or {}
    sport, treadmill = sport_from(str(ex.get("exerciseType", "")))
    active = _dur_s(ex.get("activeDuration")) or (t1 - t0).total_seconds()
    pid = str(p.get("name", "")).rsplit("/", 1)[-1]
    hr = ms.get("averageHeartRateBeatsPerMinute")
    return Activity(
        id=int(pid) if pid.isdigit() else _stable_id(t0),
        name=ex.get("displayName") or _default_name(sport, t0, tz),
        start=_local(t0, tz, off), sport=sport,
        distance_km=round(float(ms.get("distanceMillimeters", 0) or 0) / 1e6, 3),
        moving_s=int(active), elapsed_s=int((t1 - t0).total_seconds()),
        elev_m=round(float(ms.get("elevationGainMillimeters", 0) or 0) / 1000, 1),
        avg_hr=float(hr) if hr else None, trainer=treadmill,
    )
