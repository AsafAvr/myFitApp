"""fittree — grow a living tree from a running habit.

  python -m fittree import asaf takeout.zip      # Google Takeout (Fit), .tcx, Strava csv / JSON
  python -m fittree inspect takeout.zip          # what's inside an export
  python -m fittree auth amir              # one-time consent (Google Health or Strava, per athletes.json)
  python -m fittree exchange amir URL|CODE # ...or finish a consent someone else clicked
  python -m fittree sync                   # pull new workouts for every athlete
  python -m fittree demo demo --kind seasoned    # synthetic runner, no data needed
  python -m fittree build --png            # genome -> site/<key>/index.html (+ tree.png)
  python -m fittree send amir --dry-run    # Telegram / email the weekly card
  python -m fittree weekly                 # sync + build + png + send (the GitHub Action)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
from pathlib import Path

from . import google, habits, notify, site, story, strava
from .model import Activity, dedupe_sorted, from_strava_api

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "athletes.json"
DATA = ROOT / "data"
SITE = ROOT / "site"
WEEKDAY = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}


def load_config() -> dict:
    cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {"athletes": []}
    cfg["by_key"] = {a["key"]: a for a in cfg["athletes"]}
    return cfg


def athlete_cfg(cfg: dict, key: str) -> dict:
    return cfg["by_key"].get(key) or {"key": key, "name": key.title()}


def data_dir(key: str) -> Path:
    d = DATA / key
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_acts(key: str) -> list[Activity]:
    p = DATA / key / "activities.json"
    if not p.exists():
        return []
    return [Activity.from_json(x) for x in json.loads(p.read_text())]


def save_acts(key: str, acts: list[Activity]) -> Path:
    p = data_dir(key) / "activities.json"
    p.write_text(json.dumps([a.to_json() for a in dedupe_sorted(acts)], ensure_ascii=False, indent=0))
    return p


def site_link(key: str) -> str | None:
    base = os.getenv("SITE_URL") or load_config().get("site_url")
    return f"{base.rstrip('/')}/{key}/" if base else None


# ---------------------------------------------------------------- commands

def source_of(key: str) -> str:
    return str(athlete_cfg(load_config(), key).get("source", "google")).lower()


def _creds(provider: str) -> tuple[str, str | None]:
    p = "GOOGLE" if provider == "google" else "STRAVA"
    cid, secret = os.getenv(f"{p}_CLIENT_ID"), os.getenv(f"{p}_CLIENT_SECRET")
    if p == "GOOGLE" and cid and not secret:
        print("· GOOGLE_CLIENT_SECRET not set: relying on a proxy-injected Basic auth header for oauth2.googleapis.com")
        return cid, None
    if not (cid and secret):
        where = ("a Google Cloud OAuth client (Desktop app) with the Google Health API enabled"
                 if p == "GOOGLE" else "https://www.strava.com/settings/api")
        sys.exit(f"Set {p}_CLIENT_ID and {p}_CLIENT_SECRET first ({where}).")
    return cid, secret


GOOGLE_REMOTE_REDIRECT = "http://127.0.0.1:8766/"


def cmd_auth(a):
    prov = a.provider or source_of(a.key)
    cid, secret = _creds(prov)
    if prov == "google":
        code, redirect = google.google_capture_code(cid, port=a.port or 8766, open_browser=not a.no_browser)
        _store_tokens(a.key, "google", google.google_exchange_code(cid, secret, code, redirect))
    else:
        code = strava.capture_code_locally(cid, port=a.port or 8765, open_browser=not a.no_browser)
        _store_tokens(a.key, "strava", strava.exchange_code(cid, secret, code))


def cmd_exchange(a):
    prov = a.provider or source_of(a.key)
    cid, secret = _creds(prov)
    if a.code is None:
        link = (google.google_authorize_url(cid, GOOGLE_REMOTE_REDIRECT) if prov == "google"
                else strava.authorize_url(cid, "http://localhost/exchange_token"))
        print(link)
        print("\nSend that link to the athlete. After they allow access, their browser lands on a page\n"
              "that won't load. They send you that page's full address; then run:\n"
              f"  python -m fittree exchange {a.key} '<address or code>'")
        return
    code = a.code
    if "code=" in code:       # a whole redirect URL was pasted
        code = urllib.parse.parse_qs(urllib.parse.urlparse(code).query)["code"][0]
    if prov == "google":
        _store_tokens(a.key, "google", google.google_exchange_code(cid, secret, code, GOOGLE_REMOTE_REDIRECT))
    else:
        _store_tokens(a.key, "strava", strava.exchange_code(cid, secret, code))


def _store_tokens(key: str, prov: str, tok: dict):
    if not tok.get("refresh_token"):
        sys.exit("No refresh token returned — revoke the app's access and authorize again.")
    sec = ROOT / ".secrets"
    sec.mkdir(exist_ok=True)
    var = f"{prov.upper()}_REFRESH_TOKEN_{key.upper()}"
    (sec / f"{key}.env").write_text(f"{var}={tok['refresh_token']}\n")
    ath = tok.get("athlete", {})
    who = f" {ath.get('firstname', '')} {ath.get('lastname', '')}" if ath else ""
    print(f"\n✅ Authorized{who} for {key} ({prov}).")
    print(f"   Refresh token saved to .secrets/{key}.env (git-ignored).")
    print(f"   For the GitHub Action add it as repository secret {var}.")
    if prov == "strava" and "activity:read" not in tok.get("scope", "activity:read"):
        print("   ⚠️  activity:read scope missing — re-run and keep the activities box ticked.")


def cmd_sync(a):
    cfg = load_config()
    keys = a.keys or [x["key"] for x in cfg["athletes"]]
    for key in keys:
        old = load_acts(key)
        after = None if a.full or not old else max(x.start for x in old) - dt.timedelta(days=3)
        if source_of(key) == "google":
            gc = google.GoogleHealthClient.from_env(key)
            if not gc.configured:
                print(f"· {key}: no Google Health credentials, keeping cached data")
                continue
            tz = athlete_cfg(cfg, key).get("timezone", google.DEFAULT_TZ)
            new = gc.exercises(since=after.date() if after else None, tz=tz)
            save_acts(key, old + new)
            print(f"· {key}: {len(new)} workouts from Google Health, {len(load_acts(key))} cached")
            continue
        client = strava.StravaClient.from_env(key)
        if not client.configured:
            print(f"· {key}: no Strava credentials, keeping cached data")
            continue
        new = client.activities(after=after)
        save_acts(key, old + new)
        prof = client.athlete()
        (data_dir(key) / "athlete.json").write_text(json.dumps({
            "id": prof.get("id"), "first_name": prof.get("firstname"), "last_name": prof.get("lastname"),
            "avatar": prof.get("profile_medium") or prof.get("profile"), "source": "Strava"}, ensure_ascii=False))
        print(f"· {key}: {len(new)} activities fetched, {len(load_acts(key))} cached")
        if client.rotated_refresh_token:
            print(f"  ⚠️  Strava rotated the refresh token for {key}; update STRAVA_REFRESH_TOKEN_{key.upper()}.")


def cmd_import(a):
    src = Path(a.file)
    tz = a.tz or athlete_cfg(load_config(), a.key).get("timezone", google.DEFAULT_TZ)
    if src.is_dir() or src.suffix.lower() in (".zip", ".tcx"):
        acts = google.load_takeout(src, tz=tz)
    elif src.suffix.lower() == ".csv":
        acts = strava.load_bulk_export(src, utc_offset_hours=a.utc_offset)
    else:
        raw = json.loads(src.read_text())
        if isinstance(raw, dict):
            raw = raw.get("activities") or raw.get("data") or []
        acts = [from_strava_api(x) for x in raw]
    save_acts(a.key, load_acts(a.key) + acts)
    print(f"· {a.key}: imported {len(acts)} activities ({sum(x.is_run for x in acts)} runs)")


def cmd_inspect(a):
    print(google.inspect(a.file))


def cmd_demo(a):
    acts = __import__("fittree.demo", fromlist=["synth"]).synth(a.kind, seed=a.seed)
    save_acts(a.key, acts)
    (data_dir(a.key) / "athlete.json").write_text(json.dumps(
        {"id": f"demo-{a.key}", "first_name": a.name or a.key.title(), "source": "synthetic demo"}))
    print(f"· {a.key}: {len(acts)} synthetic activities ({a.kind})")


def build_one(key: str, cfg: dict, png: bool, as_of: dt.date | None = None) -> tuple[dict, dict, Path]:
    ac = athlete_cfg(cfg, key)
    acts = load_acts(key)
    prof_p = DATA / key / "athlete.json"
    prof = json.loads(prof_p.read_text()) if prof_p.exists() else {}
    athlete = {"id": prof.get("id") or ac.get("strava_id") or key, "key": key,
               "first_name": ac.get("name") or prof.get("first_name") or key.title(),
               "name": ac.get("name") or prof.get("first_name") or key.title(),
               "avatar": prof.get("avatar"), "source": prof.get("source", "Strava")}
    opts = habits.Options(as_of=as_of, week_start=WEEKDAY.get(str(ac.get("week_start", "monday")).lower(), 0),
                          target_runs=int(ac.get("target_runs", 3)),
                          include_names=bool(ac.get("show_run_names", True)))
    g = habits.build_genome(acts, athlete, opts)
    s = story.compose(g)
    out = SITE / key
    page = site.write_page(g, s, out)
    if png:
        site.snapshot(page, out / "tree.png")
        (out / f"tree-{g['as_of']}.png").write_bytes((out / "tree.png").read_bytes())
    return g, s, page


def cmd_build(a):
    cfg = load_config()
    keys = a.keys or [x["key"] for x in cfg["athletes"] if (DATA / x["key"] / "activities.json").exists()]
    entries = []
    for key in keys:
        g, s, page = build_one(key, cfg, a.png, dt.date.fromisoformat(a.as_of) if a.as_of else None)
        sm = g.get("summary", {})
        entries.append({"key": key, "name": g["athlete"]["first_name"],
                        "line": f"{sm.get('runs', 0)} runs · {sm.get('km', 0):.0f} km · {sm.get('season_label', '')}"})
        print(f"· {key}: {page.relative_to(ROOT)}  —  {s['title']}")
    site.write_index(entries, SITE)


def cmd_send(a):
    cfg = load_config()
    keys = a.keys or [x["key"] for x in cfg["athletes"] if x.get("send")]
    for key in keys:
        out = SITE / key
        s = json.loads((out / "story.json").read_text())
        png = out / "tree.png"
        link = site_link(key)
        if a.dry_run:
            print(f"--- {key} ({png}) ---\n{s['caption']}\n{link or ''}\n")
            continue
        chans = athlete_cfg(cfg, key).get("send", {"telegram": True, "email": True})
        if chans.get("telegram"):
            notify.send_telegram(key, png, s["caption"], link)
        if chans.get("email"):
            notify.send_email(key, png, s, link)


def cmd_weekly(a):
    cmd_sync(argparse.Namespace(keys=None, full=False))
    cmd_build(argparse.Namespace(keys=None, png=True, as_of=None))
    if a.send:
        cmd_send(argparse.Namespace(keys=None, dry_run=a.dry_run))


def main(argv=None):
    p = argparse.ArgumentParser(prog="fittree", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("auth", help="authorize an athlete via the browser")
    s.add_argument("key"); s.add_argument("--port", type=int); s.add_argument("--no-browser", action="store_true")
    s.add_argument("--provider", choices=["google", "strava"]); s.set_defaults(fn=cmd_auth)
    s = sp.add_parser("exchange", help="print the consent link, or trade the returned address/code for a token")
    s.add_argument("key"); s.add_argument("code", nargs="?"); s.add_argument("--provider", choices=["google", "strava"])
    s.set_defaults(fn=cmd_exchange)
    s = sp.add_parser("inspect", help="show what an export archive contains")
    s.add_argument("file"); s.set_defaults(fn=cmd_inspect)
    s = sp.add_parser("sync", help="pull activities from the Strava API")
    s.add_argument("keys", nargs="*"); s.add_argument("--full", action="store_true"); s.set_defaults(fn=cmd_sync)
    s = sp.add_parser("import", help="import Google Takeout (.zip/folder), .tcx, Strava activities.csv or JSON")
    s.add_argument("key"); s.add_argument("file"); s.add_argument("--utc-offset", type=float, default=2.0)
    s.add_argument("--tz", help="IANA time zone for UTC timestamps (default from athletes.json, else Asia/Jerusalem)")
    s.set_defaults(fn=cmd_import)
    s = sp.add_parser("demo", help="write synthetic activities for KEY")
    s.add_argument("key"); s.add_argument("--kind", default="seasoned", choices=["seasoned", "beginner"])
    s.add_argument("--name"); s.add_argument("--seed", type=int, default=7); s.set_defaults(fn=cmd_demo)
    s = sp.add_parser("build", help="build tree pages (and PNG cards with --png)")
    s.add_argument("keys", nargs="*"); s.add_argument("--png", action="store_true"); s.add_argument("--as-of")
    s.set_defaults(fn=cmd_build)
    s = sp.add_parser("send", help="send the weekly card")
    s.add_argument("keys", nargs="*"); s.add_argument("--dry-run", action="store_true"); s.set_defaults(fn=cmd_send)
    s = sp.add_parser("weekly", help="sync + build + png (+ send)")
    s.add_argument("--send", action="store_true"); s.add_argument("--dry-run", action="store_true")
    s.set_defaults(fn=cmd_weekly)
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
