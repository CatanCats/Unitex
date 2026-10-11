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
from urllib.parse import parse_qs, urlparse

import feedparser

ROOT = Path(__file__).resolve().parent.parent
FEEDS_FILE = ROOT / "scripts" / "feeds.json"
OUT_FILE = ROOT / "news.json"

PER_FEED = 15        # items read from each feed
PER_SOURCE = 5       # max items one source can contribute to a category
PER_CATEGORY = 120   # items kept per category
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
    if feed.get("aggregator") and feed["source"] == "Google News":
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


def real_link(link):
    """Bing News RSS links go through bing.com/news/apiclick.aspx?url=…; return the article itself."""
    u = urlparse(link)
    if u.hostname and u.hostname.endswith("bing.com"):
        target = parse_qs(u.query).get("url")
        if target:
            return target[0]
    return link


def outlet_of(e):
    src = e.get("source") or {}
    return src.get("title") or e.get("news_source") or e.get("source_title")


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
        link = real_link(link)
        source = feed["source"]
        if feed.get("aggregator"):
            # Google News titles end in " - Outlet"; credit the real outlet.
            outlet = outlet_of(e)
            if outlet and title.endswith(" - " + outlet):
                title = title[: -len(outlet) - 3]
            source = outlet or source
        host = urlparse(link).hostname or ""
        if host.endswith("news.google.com"):
            host = urlparse((e.get("source") or {}).get("href") or link).hostname or host
        items.append({
            "title": title,
            "url": link,
            "source": source,
            # Which news feed found it: Google News, Bing News, Yahoo News, or the outlet's own feed.
            "via": [feed["source"]],
            "domain": host.removeprefix("www."),
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
        # The same story from several feeds becomes one item that credits each of them.
        by_key = {}
        for item in pool:
            first = by_key.setdefault(norm(item["title"]), item)
            if first is not item:
                for v in item["via"]:
                    if v not in first["via"]:
                        first["via"].append(v)
                first["image"] = first["image"] or item["image"]
                if len(item["summary"]) > len(first["summary"]):
                    first["summary"] = item["summary"]
                if "news.google.com" in first["url"] and "news.google.com" not in item["url"]:
                    first["url"], first["domain"] = item["url"], item["domain"]
        per_source, kept = {}, []
        for item in pool:
            if by_key.get(norm(item["title"])) is not item:
                continue
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
