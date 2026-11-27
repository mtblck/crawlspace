# Changelog

What changed in Crawlspace, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/). The version is `version` in
[`.claude-plugin/plugin.json`](.claude-plugin/plugin.json); installed copies only update when it changes.

A pull request that changes the plugin adds its lines under **Unreleased**. A release moves them under the new
version with the date and bumps `plugin.json` and `VERSION` in `scripts/seo-check.mjs` to match.

## [Unreleased]

### Added

- Agent readiness in `/crawlspace:ai-search` and the checker: Content-Signal lines in robots.txt, whether the
  site serves or links a Markdown version for agents, and whether the server blocks or challenges AI fetchers
  (OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot) that robots.txt allows (`agents.blocked`, P3). (#17)
- The checker measures the site's own images: `img.heavy` (over 200 KB, P2 over 1 MB), `img.format` (JPEG, PNG
  or GIF over 100 KB where WebP or AVIF would do), `img.srcset` (1000 px or wider with no `srcset` or
  `<picture>`) and `img.lcp-lazy` (the first image on the page is `loading="lazy"`, P2). Up to 150 same-site
  images are downloaded (`--max-images`); images on other hosts aren't fetched. (#18)
- `scripts/field-cwv.mjs` gets real-user Core Web Vitals (LCP, INP and CLS at the 75th percentile, plus FCP and
  TTFB) for each page and the whole origin from the PageSpeed Insights API, rated against Google's thresholds.
  The audit uses field data first and labels Lighthouse numbers as lab. It works without a key; set
  `PAGESPEED_API_KEY` for more quota. (#19)
- `/crawlspace:page brief <query>` writes a content brief for a page that doesn't exist yet (intent and format
  from what ranks, title, description, slug, an outline with the questions to answer and what only this site
  can say, evidence to gather, internal links and schema), after checking no existing page already targets
  the query. `/crawlspace:page refresh` builds a queue of pages to update, from lost Search Console clicks,
  out-of-date content, real last-edit dates and striking-distance queries. The checker's JSON now includes
  each page's sitemap `lastmod`. (#20)
- `seo-check.mjs --baseline earlier.json` compares a run with an earlier one: it re-checks every baseline page
  and grades regressions as `drift.*` findings (a page that stopped answering 200, became noindex, moved its
  canonical away, or lost its share image, structured data or most of its words; a search crawler newly
  blocked; a shrinking sitemap), lists title, description and H1 changes to confirm, and shows the score and
  the kinds of finding gained and gone. P1 drift fails the run, so it can gate a deploy. The audit skill uses it
  to prove fixes. (#13)
- `seo-check.mjs --redirects FILE` checks a migration's redirects: give it the old URLs or paths (a list, an
  `old,new` CSV or the old sitemap) and it flags each that doesn't 301/308 in one hop to a live, indexable page
  that is its own canonical (missing, temporary, chained or looping redirects, redirects to the home page or to
  the wrong page, and targets that are broken, noindex or canonicalised elsewhere). The audit skill says where
  to find the old URLs. (#14)
- `/crawlspace:search-console` works from Google's own data: a Search Console export or a Search Console MCP
  server's tools. The new `scripts/gsc.mjs` lists striking-distance queries (positions 8 to 20), titles with low
  CTR against the site's own CTR at that position, real cannibalisation (one query, several pages), and lost
  clicks with whether position, impressions or CTR moved, and puts checker findings on pages that already get
  impressions first. The skill also sorts URL Inspection and Page indexing results into what each needs.
  `audit` and `keywords` hand off to it. (#15)
- `/crawlspace:links` writes an internal linking plan: specific links to add (source page, anchor text,
  target), hub pages for topics that lack one, and anchors to rewrite, based on the site's real link graph and
  the keyword map.
- The checker's `--crawl` now records, per page, how many pages link to it, which ones, and the anchor texts
  used, telling navigation links (on 80%+ of pages) from links in the content (`crawl.nodes` in the JSON). New
  P3 findings: `links.few-inbound` (non-navigation pages with one internal link or none) and
  `links.generic-anchor` ("read more", "click here"). (#16)

## [2.0.0] - 2026-11-25

### Changed

- The `seo` plugin is now **Crawlspace** and lives in its own repo, mtblck/crawlspace. The skills are called as
  `/crawlspace:audit`, `/crawlspace:page`, `/crawlspace:schema`, `/crawlspace:social`, `/crawlspace:keywords` and
  `/crawlspace:ai-search` instead of `/seo:…`. Install it with `crawlspace@crawlspace`, or as `crawlspace@mtblck`
  from mtblck/claude-marketplace.
- The checker's user agent links to this repo. The checker, checklist and preview scripts and the files they write
  (`seo-check.mjs`, `SEO-AUDIT.md`, `checklist.json`) keep their names.

## 1.4.0 and earlier

Released as the `seo` plugin in [mtblck/claude-marketplace](https://github.com/mtblck/claude-marketplace)
(full site audit, page, schema, social with link previews, AI search, keywords, the link-graph crawl and the
launch checklist). See that repo's history for details.

[Unreleased]: https://github.com/mtblck/crawlspace/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/mtblck/crawlspace/releases/tag/v2.0.0
