"""fittree — grow a living tree from a running habit.

  python -m fittree auth amir              # one-time Strava consent (opens browser)
  python -m fittree exchange amir CODE     # ...or trade a code someone sent you
  python -m fittree sync                   # pull runs from Strava for every athlete
  python -m fittree import asaf activities.csv   # or a Strava bulk export / JSON list
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
from pathlib import Path

from . import habits, notify, site, story, strava
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

def cmd_auth(a):
    cid, secret = os.getenv("STRAVA_CLIENT_ID"), os.getenv("STRAVA_CLIENT_SECRET")
    if not (cid and secret):
        sys.exit("Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET first (https://www.strava.com/settings/api).")
    code = strava.capture_code_locally(cid, port=a.port, open_browser=not a.no_browser)
    _store_tokens(a.key, strava.exchange_code(cid, secret, code))


def cmd_exchange(a):
    cid, secret = os.getenv("STRAVA_CLIENT_ID"), os.getenv("STRAVA_CLIENT_SECRET")
    if not (cid and secret):
        sys.exit("Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET first.")
    if a.code is None:
        print(strava.authorize_url(cid, "http://localhost/exchange_token"))
        print("\nSend that link to the athlete. After 'Authorize' their browser lands on a page that\n"
              "won't load — the address bar contains ...&code=XXXX. Run: python -m fittree exchange KEY XXXX")
        return
    _store_tokens(a.key, strava.exchange_code(cid, secret, a.code))


def _store_tokens(key: str, tok: dict):
    sec = ROOT / ".secrets"
    sec.mkdir(exist_ok=True)
    ath = tok.get("athlete", {})
    (sec / f"{key}.env").write_text(f"STRAVA_REFRESH_TOKEN_{key.upper()}={tok['refresh_token']}\n")
    print(f"\n✅ Authorized {ath.get('firstname', '')} {ath.get('lastname', '')} (Strava id {ath.get('id')}).")
    print(f"   Refresh token saved to .secrets/{key}.env (git-ignored).")
    print(f"   For the GitHub Action add it as repository secret STRAVA_REFRESH_TOKEN_{key.upper()}.")
    if "activity:read" not in tok.get("scope", "activity:read"):
        print("   ⚠️  activity:read scope missing — re-run and keep the activities box ticked.")


def cmd_sync(a):
    cfg = load_config()
    keys = a.keys or [x["key"] for x in cfg["athletes"]]
    for key in keys:
        client = strava.StravaClient.from_env(key)
        if not client.configured:
            print(f"· {key}: no Strava credentials, keeping cached data")
            continue
        old = load_acts(key)
        after = None if a.full or not old else max(x.start for x in old) - dt.timedelta(days=3)
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
    if src.suffix.lower() == ".csv":
        acts = strava.load_bulk_export(src, utc_offset_hours=a.utc_offset)
    else:
        raw = json.loads(src.read_text())
        if isinstance(raw, dict):
            raw = raw.get("activities") or raw.get("data") or []
        acts = [from_strava_api(x) for x in raw]
    save_acts(a.key, load_acts(a.key) + acts)
    print(f"· {a.key}: imported {len(acts)} activities ({sum(x.is_run for x in acts)} runs)")


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
    s.add_argument("key"); s.add_argument("--port", type=int, default=8765); s.add_argument("--no-browser", action="store_true")
    s.set_defaults(fn=cmd_auth)
    s = sp.add_parser("exchange", help="print the consent link, or trade a code for a refresh token")
    s.add_argument("key"); s.add_argument("code", nargs="?"); s.set_defaults(fn=cmd_exchange)
    s = sp.add_parser("sync", help="pull activities from the Strava API")
    s.add_argument("keys", nargs="*"); s.add_argument("--full", action="store_true"); s.set_defaults(fn=cmd_sync)
    s = sp.add_parser("import", help="import a Strava activities.csv or a JSON list of activities")
    s.add_argument("key"); s.add_argument("file"); s.add_argument("--utc-offset", type=float, default=2.0)
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
