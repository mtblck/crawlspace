# Changelog

What changed in Crawlspace, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/). The version is `version` in
[`.claude-plugin/plugin.json`](.claude-plugin/plugin.json); installed copies only update when it changes.

A pull request that changes the plugin adds its lines under **Unreleased**. A release moves them under the new
version with the date and bumps `plugin.json` and `VERSION` in `scripts/seo-check.mjs` to match.

## [Unreleased]

### Added

- `seo-check.mjs --redirects FILE` checks a migration's redirects: give it the old URLs or paths (a list, an
  `old,new` CSV or the old sitemap) and it flags each that doesn't 301/308 in one hop to a live, indexable page
  that is its own canonical (missing, temporary, chained or looping redirects, redirects to the home page or to
  the wrong page, and targets that are broken, noindex or canonicalised elsewhere). The audit skill says where
  to find the old URLs. (#PR)

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
