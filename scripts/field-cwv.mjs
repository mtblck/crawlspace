#!/usr/bin/env node
// field-cwv.mjs: Core Web Vitals field data (Chrome UX Report, 75th percentile)
// for a few URLs and their origin, from Google's PageSpeed Insights API.
// Zero-dependency, Node 18+.
//
//   node field-cwv.mjs --url https://example.com/ [--url https://example.com/pricing]
//                      [--strategy mobile|desktop] [--json out.json] [--md out.md]
//
// This sends the URLs to Google (googleapis.com), not to the site, so it is kept
// apart from seo-check.mjs. Public URLs only. The API works without a key at a
// low shared quota; for more, set PAGESPEED_API_KEY (a free Google Cloud API key).
// The key is sent only to Google and never printed or written out.

import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const all = (n) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []))
const opt = (n, d) => all(n)[0] ?? d
const urls = all('url')
if (argv.includes('--help') || !urls.length) {
  console.log(`field-cwv.mjs: real-user Core Web Vitals (CrUX p75) from PageSpeed Insights
  --url URL          a public page (repeatable; up to 10)
  --strategy S       mobile (default) or desktop
  --json FILE        write the result as JSON
  --md FILE          write the report as Markdown
Set PAGESPEED_API_KEY for more than the keyless quota.`)
  process.exit(argv.includes('--help') ? 0 : 2)
}
const STRATEGY = opt('strategy', 'mobile') === 'desktop' ? 'desktop' : 'mobile'
const ENDPOINT = process.env.FIELD_CWV_ENDPOINT || 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed' // overridable for tests
const KEY = process.env.PAGESPEED_API_KEY || ''
const TIMEOUT = Number(opt('timeout', 90000))

// Google's thresholds at the 75th percentile: good / needs improvement / poor.
export const METRICS = [
  { id: 'LARGEST_CONTENTFUL_PAINT_MS', name: 'LCP', unit: 'ms', good: 2500, poor: 4000, core: true },
  { id: 'INTERACTION_TO_NEXT_PAINT', name: 'INP', unit: 'ms', good: 200, poor: 500, core: true },
  { id: 'CUMULATIVE_LAYOUT_SHIFT_SCORE', name: 'CLS', unit: '', good: 0.1, poor: 0.25, core: true, scale: 100 },
  { id: 'FIRST_CONTENTFUL_PAINT_MS', name: 'FCP', unit: 'ms', good: 1800, poor: 3000 },
  { id: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE', name: 'TTFB', unit: 'ms', good: 800, poor: 1800 },
]

const rate = (m, v) => (v == null ? null : v <= m.good ? 'good' : v <= m.poor ? 'needs improvement' : 'poor')

// One loadingExperience block → { metrics: {LCP: {p75, rating}}, passes }
export function readExperience(exp) {
  if (!exp?.metrics || !Object.keys(exp.metrics).length) return null
  const metrics = {}
  for (const m of METRICS) {
    const raw = exp.metrics[m.id]?.percentile
    if (raw == null) continue
    const p75 = m.scale ? raw / m.scale : raw
    metrics[m.name] = { p75, rating: rate(m, p75) }
  }
  const core = METRICS.filter((m) => m.core && metrics[m.name])
  // passes the assessment when every core metric it has data for is good
  const passes = core.length ? core.every((m) => metrics[m.name].rating === 'good') : null
  return { metrics, passes }
}

async function fetchPsi(url) {
  const q = new URLSearchParams({ url, strategy: STRATEGY, category: 'performance' })
  if (KEY) q.set('key', KEY)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(`${ENDPOINT}?${q}`, { signal: ctrl.signal })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: res.status === 429 ? 'quota exceeded (429): set PAGESPEED_API_KEY to a free Google Cloud API key, or wait and retry' : `HTTP ${res.status}: ${body?.error?.message?.slice(0, 160) || 'no detail'}` }
    return { body }
  } catch (e) {
    return { error: e.cause?.code || e.name || String(e) }
  } finally {
    clearTimeout(t)
  }
}

const fmt = (name, v) => (v == null ? '—' : name === 'CLS' ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)

export function report(r) {
  const L = [`# Field Core Web Vitals (${r.strategy}, Chrome UX Report, 75th percentile)`, '']
  L.push('Real Chrome users over the last 28 days. "Origin" is the whole site, used when a page has too little traffic of its own. Good: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.', '')
  L.push('| URL | Data | Passes | LCP | INP | CLS | FCP | TTFB |', '| --- | --- | --- | --- | --- | --- | --- | --- |')
  const cell = (e, n) => (e?.metrics[n] ? `${fmt(n, e.metrics[n].p75)}${e.metrics[n].rating === 'good' ? '' : ` (${e.metrics[n].rating})`}` : '—')
  for (const p of r.pages) {
    if (p.error) {
      L.push(`| ${p.url} | error: ${p.error} | | | | | | |`)
      continue
    }
    const e = p.page || p.origin
    const src = p.page ? 'page' : p.origin ? 'origin only' : 'none: not enough traffic'
    L.push(`| ${p.url} | ${src} | ${e?.passes == null ? '—' : e.passes ? 'yes' : '**no**'} | ${['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].map((n) => cell(e, n)).join(' | ')} |`)
  }
  const o = r.pages.find((p) => p.origin)?.origin
  if (o) L.push('', `Origin: ${o.passes ? 'passes' : '**fails**'} · ${['LCP', 'INP', 'CLS'].map((n) => `${n} ${cell(o, n)}`).join(' · ')}`)
  return L.join('\n') + '\n'
}

const pages = []
for (const url of urls.slice(0, 10)) {
  const { body, error } = await fetchPsi(url)
  if (error) {
    pages.push({ url, error })
    continue
  }
  const le = body.loadingExperience
  pages.push({
    url,
    page: le && !le.origin_fallback ? readExperience(le) : null,
    origin: readExperience(body.originLoadingExperience),
  })
}
const result = { tool: 'field-cwv', strategy: STRATEGY, fetchedAt: new Date().toISOString(), pages }
const md = report(result)
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(result, null, 2))
if (opt('md')) writeFileSync(opt('md'), md)
console.log(md)
process.exit(pages.every((p) => p.error) ? 2 : 0)
