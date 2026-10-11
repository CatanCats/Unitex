"""Fetch every feed in feeds.json and write news.json for the site.

Run by .github/workflows/news.yml on a schedule. Needs `feedparser`.
"""
import calendar
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import feedparser

ROOT = Path(__file__).resolve().parent.parent
FEEDS_FILE = ROOT / "scripts" / "feeds.json"
OUT_FILE = ROOT / "news.json"

PER_FEED = 15        # items read from each feed
PER_SOURCE = 6       # max items one source can contribute to a category
PER_CATEGORY = 80    # items kept per category
MAX_AGE_H = 72       # drop stories older than this
UA = "Mozilla/5.0 (compatible; UnitexNews/1.0; +https://github.com/CatanCats/Unitex)"

TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")


def clean(s, limit=None):
    s = SPACE.sub(" ", html.unescape(TAG.sub(" ", s or ""))).strip()
    if limit and len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0] + "…"
    return s


def image_of(e):
    for key in ("media_thumbnail", "media_content"):
        for m in e.get(key) or []:
            if m.get("url") and not m.get("url", "").endswith((".mp4", ".mp3")):
                return m["url"]
    for link in e.get("links") or []:
        if link.get("rel") == "enclosure" and link.get("type", "").startswith("image/"):
            return link.get("href")
    m = re.search(r'<img[^>]+src="([^"]+)"', e.get("summary", "") or "")
    return m.group(1) if m else None


def summary_of(e, feed):
    if feed.get("aggregator"):
        return ""
    s = clean(e.get("summary"), 220)
    # Link aggregators (HN, Lobsters) put only URLs or "Comments" in the summary.
    if s.startswith(("Article URL", "Comments")) or len(s) < 25:
        return ""
    return s


def published_of(e):
    for key in ("published_parsed", "updated_parsed"):
        t = e.get(key)
        if t:
            return calendar.timegm(t)
    return None


def fetch(feed):
    try:
        req = urllib.request.Request(feed["url"], headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
        with urllib.request.urlopen(req, timeout=30) as r:
            parsed = feedparser.parse(r.read())
    except Exception as err:  # one broken feed must not break the rest
        return feed, [], f"{type(err).__name__}: {err}"

    items = []
    for e in parsed.entries[:PER_FEED]:
        title, link = clean(e.get("title")), e.get("link")
        if not title or not link:
            continue
        source = feed["source"]
        if feed.get("aggregator"):
            # Google News titles end in " - Outlet"; credit the real outlet.
            outlet = (e.get("source") or {}).get("title")
            if outlet and title.endswith(" - " + outlet):
                title = title[: -len(outlet) - 3]
            source = outlet or source
        items.append({
            "title": title,
            "url": link,
            "source": source,
            "domain": urlparse((e.get("source") or {}).get("href") or link).hostname or "",
            "region": feed["region"] if not feed.get("aggregator") else "",
            "published": published_of(e),
            "image": image_of(e),
            "summary": summary_of(e, feed),
        })
    return feed, items, None if items else "no items"


def norm(title):
    return re.sub(r"[^a-z0-9 ]", "", title.lower())[:80]


def main():
    config = json.loads(FEEDS_FILE.read_text())
    jobs = [(cid, f) for cid, c in config.items() for f in c["feeds"]]
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda job: (job[0], *fetch(job[1])), jobs))

    now = int(time.time())
    out = {"generated": now, "categories": [], "sources": [], "errors": []}
    seen = set()
    for cid, c in config.items():
        pool = []
        for rcid, feed, items, err in results:
            if rcid != cid:
                continue
            if err:
                out["errors"].append({"source": feed["source"], "category": c["name"], "error": err})
            pool.extend(items)

        pool.sort(key=lambda i: i["published"] or 0, reverse=True)
        per_source, kept = {}, []
        for item in pool:
            if item["published"] and now - item["published"] > MAX_AGE_H * 3600:
                continue
            key = norm(item["title"])
            if key in seen or per_source.get(item["source"], 0) >= PER_SOURCE:
                continue
            seen.add(key)
            per_source[item["source"]] = per_source.get(item["source"], 0) + 1
            kept.append(item)
            if len(kept) >= PER_CATEGORY:
                break
        out["categories"].append({"id": cid, "name": c["name"], "items": kept})

    out["sources"] = sorted({i["source"] for c in out["categories"] for i in c["items"]})
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))

    total = sum(len(c["items"]) for c in out["categories"])
    print(f"{total} stories from {len(out['sources'])} sources; {len(out['errors'])} feeds failed")
    for e in out["errors"]:
        print(f"  ! {e['category']} / {e['source']}: {e['error']}")
    if total == 0:
        sys.exit("no stories fetched")


if __name__ == "__main__":
    main()
