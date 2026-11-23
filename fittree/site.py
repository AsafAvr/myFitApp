"""Builds the self-contained tree pages (one HTML file per athlete)."""
from __future__ import annotations

import html
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


def _js_json(obj) -> str:
    # safe to inline inside <script>
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def render_page(genome: dict, story: dict) -> str:
    tpl = (WEB / "viewer.html").read_text(encoding="utf-8")
    name = genome["athlete"].get("first_name") or genome["athlete"].get("name") or "Runner"
    s = genome.get("summary", {})
    desc = (f"{s.get('runs', 0)} runs, {s.get('km', 0):.0f} km, {s.get('weeks_active', 0)} growth rings — "
            f"a living tree grown from {name}'s running habit.")
    out = (tpl
           .replace("__TITLE__", html.escape(f"{name}'s running tree"))
           .replace("__DESCRIPTION__", html.escape(desc))
           .replace("/*__CSS__*/", (WEB / "viewer.css").read_text(encoding="utf-8"))
           .replace("/*__GENOME__*/null", _js_json(genome))
           .replace("/*__STORY__*/null", _js_json(story))
           .replace("/*__TREEJS__*/", (WEB / "tree.js").read_text(encoding="utf-8"))
           .replace("/*__VIEWERJS__*/", (WEB / "viewer.js").read_text(encoding="utf-8")))
    return out


def write_page(genome: dict, story: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / "index.html"
    p.write_text(render_page(genome, story), encoding="utf-8")
    (out_dir / "genome.json").write_text(json.dumps(genome, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "story.json").write_text(json.dumps(story, ensure_ascii=False, indent=1), encoding="utf-8")
    return p


def write_index(entries: list[dict], site_dir: Path) -> Path:
    """A tiny landing page linking every athlete's tree."""
    cards = "\n".join(
        f'<a class="c" href="{html.escape(e["key"])}/"><img src="{html.escape(e["key"])}/tree.png" alt="" '
        f'onerror="this.remove()"><b>{html.escape(e["name"])}</b><span>{html.escape(e["line"])}</span></a>'
        for e in entries)
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Running trees</title>
<style>
:root{{--bg:#f4efe4;--card:#fffaf0;--ink:#2a2419;--ink2:#6b604e;--line:#ddd2bd}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#12140f;--card:#1d211a;--ink:#ece6d6;--ink2:#b4ab97;--line:#2f3428}}}}
:root[data-theme="dark"]{{--bg:#12140f;--card:#1d211a;--ink:#ece6d6;--ink2:#b4ab97;--line:#2f3428}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}}
main{{max-width:960px;margin:0 auto;padding:32px 16px}}h1{{font-family:Georgia,serif;font-weight:600}}
.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}}
.c{{display:flex;flex-direction:column;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:16px;
padding:12px;color:inherit;text-decoration:none}}.c img{{width:100%;border-radius:10px}}.c span{{color:var(--ink2);font-size:13px}}
</style></head><body><main><h1>🌳 Running trees</h1><div class="g">{cards}</div></main></body></html>"""
    site_dir.mkdir(parents=True, exist_ok=True)
    p = site_dir / "index.html"
    p.write_text(page, encoding="utf-8")
    return p


def snapshot(page: Path, png: Path, width: int = 1080, height: int = 1350) -> Path:
    """Render the shareable card PNG with headless Chromium (Playwright)."""
    node = shutil.which("node")
    if not node:
        raise RuntimeError("node is required for PNG snapshots")
    subprocess.run([node, str(WEB / "snapshot.mjs"), str(page.resolve()), str(png.resolve()),
                    str(width), str(height)], check=True, cwd=ROOT)
    return png
