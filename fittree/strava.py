"""Strava data sources.

* ``StravaClient`` -- the official API with the OAuth refresh-token flow.
  Each athlete authorizes the app once (see ``python -m fittree auth``); after
  that a refresh token lets the weekly job pull new runs unattended.
* ``load_bulk_export`` -- the ``activities.csv`` inside the archive Strava
  emails you from Settings -> My Account -> "Download or Delete Your Account".
  Handy for a first import with zero API setup.

Only the standard library is used so the GitHub Action needs no installs.
"""
from __future__ import annotations

import csv
import datetime as dt
import http.server
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from typing import Iterator, Optional

from .model import Activity, from_strava_api

API = "https://www.strava.com/api/v3"
TOKEN_URL = "https://www.strava.com/oauth/token"
AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
SCOPES = "read,activity:read_all"


class StravaError(RuntimeError):
    pass


def _post_form(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise StravaError(f"{url} -> HTTP {e.code}: {e.read()[:300]!r}") from e


class StravaClient:
    def __init__(self, client_id: str | None = None, client_secret: str | None = None,
                 refresh_token: str | None = None, access_token: str | None = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        self._access = access_token
        self._expires_at = time.time() + 3600 if access_token else 0
        self.rotated_refresh_token: Optional[str] = None

    @classmethod
    def from_env(cls, athlete_key: str) -> "StravaClient":
        """Reads STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET and the per-athlete
        STRAVA_REFRESH_TOKEN_<KEY> (or STRAVA_ACCESS_TOKEN_<KEY>)."""
        k = athlete_key.upper()
        return cls(
            client_id=os.getenv("STRAVA_CLIENT_ID"),
            client_secret=os.getenv("STRAVA_CLIENT_SECRET"),
            refresh_token=os.getenv(f"STRAVA_REFRESH_TOKEN_{k}"),
            access_token=os.getenv(f"STRAVA_ACCESS_TOKEN_{k}") or os.getenv("STRAVA_ACCESS_TOKEN"),
        )

    @property
    def configured(self) -> bool:
        return bool(self._access or (self.client_id and self.client_secret and self.refresh_token))

    def access_token(self) -> str:
        if self._access and time.time() < self._expires_at - 60:
            return self._access
        if not (self.client_id and self.client_secret and self.refresh_token):
            if self._access:
                return self._access
            raise StravaError("Strava credentials missing: set STRAVA_CLIENT_ID, "
                              "STRAVA_CLIENT_SECRET and STRAVA_REFRESH_TOKEN_<ATHLETE>.")
        tok = _post_form(TOKEN_URL, {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
        })
        self._access = tok["access_token"]
        self._expires_at = float(tok.get("expires_at", time.time() + 3600))
        new_rt = tok.get("refresh_token")
        if new_rt and new_rt != self.refresh_token:
            self.rotated_refresh_token = new_rt
            self.refresh_token = new_rt
        return self._access

    def get(self, path: str, **params) -> object:
        url = f"{API}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        for attempt in range(4):
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.access_token()}"})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 3:      # rate limited: back off
                    time.sleep(30 * (attempt + 1))
                    continue
                raise StravaError(f"GET {path} -> HTTP {e.code}: {e.read()[:300]!r}") from e
        raise StravaError(f"GET {path} kept failing")

    def athlete(self) -> dict:
        return self.get("/athlete")  # type: ignore[return-value]

    def iter_activities(self, after: Optional[dt.datetime] = None) -> Iterator[dict]:
        page = 1
        params = {"per_page": 200}
        if after:
            params["after"] = int(after.timestamp())
        while True:
            batch = self.get("/athlete/activities", page=page, **params)
            if not batch:
                return
            yield from batch  # type: ignore[misc]
            if len(batch) < 200:  # type: ignore[arg-type]
                return
            page += 1

    def activities(self, after: Optional[dt.datetime] = None) -> list[Activity]:
        return [from_strava_api(a) for a in self.iter_activities(after)]


# --------------------------------------------------------------------------
# OAuth onboarding: run once per athlete.
# --------------------------------------------------------------------------

def authorize_url(client_id: str, redirect_uri: str) -> str:
    return AUTHORIZE_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "approval_prompt": "auto",
        "scope": SCOPES,
    })


def exchange_code(client_id: str, client_secret: str, code: str) -> dict:
    """Trade the one-time ``code`` from the redirect URL for tokens."""
    return _post_form(TOKEN_URL, {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
    })


def capture_code_locally(client_id: str, port: int = 8765, open_browser: bool = True) -> str:
    """Opens the Strava consent page and catches the redirect on localhost."""
    redirect = f"http://localhost:{port}/exchange_token"
    url = authorize_url(client_id, redirect)
    holder: dict = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            holder["code"] = (q.get("code") or [""])[0]
            holder["scope"] = (q.get("scope") or [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>🌱 Strava connected. You can close this tab.</h2>".encode())

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("localhost", port), H)
    t = threading.Thread(target=srv.handle_request, daemon=True)
    t.start()
    print(f"\nOpen this link and press Authorize:\n\n  {url}\n")
    if open_browser:
        webbrowser.open(url)
    t.join(timeout=600)
    srv.server_close()
    if not holder.get("code"):
        raise StravaError("No authorization code received.")
    if "activity:read" not in holder.get("scope", ""):
        raise StravaError("The 'View data about your activities' box must stay ticked.")
    return holder["code"]


# --------------------------------------------------------------------------
# Strava bulk export (activities.csv)
# --------------------------------------------------------------------------

_CSV_DATE_FORMATS = ("%b %d, %Y, %I:%M:%S %p", "%d %b %Y, %H:%M:%S", "%Y-%m-%d %H:%M:%S")


def _csv_date(s: str) -> dt.datetime:
    s = s.strip().replace(" ", " ")
    for f in _CSV_DATE_FORMATS:
        try:
            return dt.datetime.strptime(s, f)
        except ValueError:
            pass
    raise ValueError(f"Unrecognised date in activities.csv: {s!r}")


def load_bulk_export(path: str | Path, utc_offset_hours: float = 0.0) -> list[Activity]:
    """Parse ``activities.csv`` from a Strava account archive.

    The file repeats some column names (a display-unit block, then a metric
    block), so the *last* occurrence of each numeric column is used -- that is
    the one in SI units. Dates in the export are UTC; pass the athlete's
    offset to get local wall-clock times (Israel is +2 / +3).
    """
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    header, body = rows[0], rows[1:]
    last: dict[str, int] = {}
    first: dict[str, int] = {}
    for i, h in enumerate(header):
        last[h] = i
        first.setdefault(h, i)

    def col(row, name, which=last, default=""):
        i = which.get(name)
        return row[i] if i is not None and i < len(row) else default

    out = []
    for r in body:
        if not r or not col(r, "Activity ID"):
            continue
        dist = col(r, "Distance")
        dist_km = float(dist or 0) / 1000.0
        if dist_km and last.get("Distance") == first.get("Distance"):
            dist_km *= 1000.0  # only the display-unit (km) column exists
        start = _csv_date(col(r, "Activity Date", first)) + dt.timedelta(hours=utc_offset_hours)
        wt = col(r, "Workout Type")
        out.append(Activity(
            id=int(col(r, "Activity ID", first)),
            name=col(r, "Activity Name", first),
            start=start,
            sport=col(r, "Activity Type", first).replace(" ", "") or "Run",
            distance_km=round(dist_km, 3),
            moving_s=int(float(col(r, "Moving Time") or col(r, "Elapsed Time") or 0)),
            elapsed_s=int(float(col(r, "Elapsed Time") or 0)),
            elev_m=float(col(r, "Elevation Gain") or 0),
            workout_type=int(float(wt)) if wt else None,
            avg_hr=float(col(r, "Average Heart Rate")) if col(r, "Average Heart Rate") else None,
            max_hr=float(col(r, "Max Heart Rate")) if col(r, "Max Heart Rate") else None,
            effort=float(col(r, "Relative Effort")) if col(r, "Relative Effort") else None,
        ))
    return out
