#!/usr/bin/env node
// gsc.mjs: read Google Search Console performance rows and find what to act on.
// Zero-dependency (Node 18+), offline: it reads files and never calls an API.
//
//   node gsc.mjs --rows rows.csv [--previous earlier.csv] [--checker seo.json]
//                [--min-impressions 50] [--json out.json] [--md out.md]
//
// --rows takes a CSV, TSV or JSON array with any of these columns (Search
// Console's own export names work): query ("Top queries", "Query"), page ("Top
// pages", "Page", "Landing page", "URL"), clicks, impressions, ctr ("3.2%" or
// 0.032), position ("Average position"). Query + page rows (from a Search Console
// MCP server, the API, Search Analytics for Sheets or the BigQuery bulk export)
// allow every analysis; the UI export's separate Queries.csv and Pages.csv each
// allow some, and the report says which were skipped. Pass --rows twice to give
// both files.
//
// Reports: totals; striking distance (average position 8 to 20); low CTR for
// the position, measured against this site's own CTR at that position, not an
// industry curve; cannibalisation (one query, several of the site's pages each
// taking a real share of impressions); with --previous, what lost clicks and
// whether position, impressions or CTR explains it; with --checker, pages that
// get impressions and have P1/P2 checker findings.

import { readFileSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const all = (n) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []))
const opt = (n, d) => all(n)[0] ?? d
if (argv.includes('--help') || !all('rows').length) {
  console.log(`gsc.mjs: Search Console rows → striking distance, low CTR, cannibalisation, drops
  --rows FILE          CSV, TSV or JSON rows (repeatable: Queries.csv and Pages.csv)
  --previous FILE      the same export for an earlier period (repeatable)
  --checker FILE       a seo-check --json run, to join findings onto pages with impressions
  --min-impressions N  ignore rows below this many impressions (default 50)
  --top N              rows per section (default 25)
  --json FILE          write the result as JSON
  --md FILE            write the report as Markdown`)
  process.exit(argv.includes('--help') ? 0 : 2)
}
const MIN = Number(opt('min-impressions', 50))
const TOP = Number(opt('top', 25))

// ---------------------------------------------------------------- reading

export function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0]
  const sep = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) row.push(cell), (cell = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell), rows.push(row), (row = []), (cell = '')
    } else cell += c
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim()))
}

const COLS = {
  query: /^(top )?quer(y|ies)$|^search query$|^keys?$/i,
  page: /^(top )?pages?$|^landing page$|^url$|^address$/i,
  date: /^date$/i,
  clicks: /^(url )?clicks$/i,
  impressions: /^(url )?impressions$/i,
  ctr: /^(url )?ctr$|^click.?through rate$/i,
  position: /^(average |avg\.? )?position$/i,
}
const num = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).trim().replace(/,/g, '')
  if (s.endsWith('%')) return Number(s.slice(0, -1)) / 100
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function readRows(text) {
  let records
  const t = text.trim()
  if (t.startsWith('[') || t.startsWith('{')) {
    const j = JSON.parse(t)
    records = Array.isArray(j) ? j : j.rows || []
    // the API's shape: { keys: [query, page], clicks, ... }; assume query, page order
    records = records.map((r) => (Array.isArray(r.keys) ? { query: r.keys[0], page: r.keys[1], ...r } : r))
  } else {
    const [head, ...body] = parseCsv(text)
    records = body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])))
  }
  return records
    .map((r) => {
      const out = {}
      for (const [k, v] of Object.entries(r)) {
        const col = Object.keys(COLS).find((c) => COLS[c].test(k.trim()))
        if (col && out[col] == null) out[col] = v
      }
      for (const c of ['clicks', 'impressions', 'ctr', 'position']) out[c] = num(out[c])
      if (out.ctr == null && out.impressions) out.ctr = (out.clicks || 0) / out.impressions
      if (out.ctr > 1) out.ctr /= 100 // a percentage without the % sign
      return out
    })
    .filter((r) => (r.query || r.page) && r.impressions != null)
}

// ---------------------------------------------------------------- analysis

const keyOf = (u) => {
  try {
    const x = new URL(u)
    return x.pathname + x.search
  } catch {
    return u
  }
}

// Sum rows by a key (query, page or both), weighting position by impressions as
// Search Console does.
export function rollup(rows, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (k == null) continue
    const g = m.get(k) || { key: k, query: r.query ?? null, page: r.page ?? null, clicks: 0, impressions: 0, posSum: 0, posImpr: 0 }
    g.clicks += r.clicks || 0
    g.impressions += r.impressions || 0
    if (r.position != null) (g.posSum += r.position * (r.impressions || 0)), (g.posImpr += r.impressions || 0)
    m.set(k, g)
  }
  return [...m.values()].map(({ posSum, posImpr, ...g }) => ({ ...g, ctr: g.impressions ? g.clicks / g.impressions : 0, position: posImpr ? posSum / posImpr : null }))
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}

export function analyse(rows, { previous = null, checker = null, min = 50, top = 25 } = {}) {
  const hasQuery = rows.some((r) => r.query)
  const hasPage = rows.some((r) => r.page)
  const hasBoth = rows.some((r) => r.query && r.page)
  const skipped = []

  // the unit we judge: query+page when we have it, else whichever we have
  const unit = hasBoth ? (r) => (r.query && r.page ? `${r.query}\u0000${keyOf(r.page)}` : null) : hasQuery ? (r) => r.query || null : (r) => (r.page ? keyOf(r.page) : null)
  const units = rollup(rows, unit)
  const pages = hasPage ? rollup(rows, (r) => (r.page ? keyOf(r.page) : null)) : []
  const queries = hasQuery ? rollup(rows, (r) => r.query || null) : []
  const totalsFrom = hasQuery ? queries : pages
  const totals = {
    clicks: totalsFrom.reduce((s, r) => s + r.clicks, 0),
    impressions: totalsFrom.reduce((s, r) => s + r.impressions, 0),
  }
  totals.ctr = totals.impressions ? totals.clicks / totals.impressions : 0
  const pi = totalsFrom.filter((r) => r.position != null)
  totals.position = pi.length ? pi.reduce((s, r) => s + r.position * r.impressions, 0) / pi.reduce((s, r) => s + r.impressions, 0) : null

  const big = units.filter((u) => u.impressions >= min && u.position != null)

  // striking distance: close enough that a better page could move it onto page 1 or up it
  const striking = big.filter((u) => u.position >= 8 && u.position <= 20).sort((a, b) => b.impressions - a.impressions).slice(0, top)

  // low CTR for the position: below half this site's own median CTR at that rounded position
  const byPos = new Map()
  for (const u of big) if (u.position <= 10) byPos.set(Math.round(u.position), [...(byPos.get(Math.round(u.position)) || []), u.ctr])
  const lowCtr = big
    .filter((u) => u.position <= 10)
    .map((u) => {
      const peers = byPos.get(Math.round(u.position))
      return { ...u, typicalCtr: peers.length >= 3 ? median(peers) : null }
    })
    .filter((u) => u.typicalCtr != null && u.ctr < u.typicalCtr / 2)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, top)
  if (!big.some((u) => u.position <= 10)) skipped.push('low CTR: no rows in positions 1 to 10 with enough impressions')

  // cannibalisation: one query, two or more pages each with at least 10% of its impressions
  let cannibal = []
  if (hasBoth) {
    const perQuery = new Map()
    for (const u of units) perQuery.set(u.query, [...(perQuery.get(u.query) || []), u])
    for (const [q, us] of perQuery) {
      const total = us.reduce((s, u) => s + u.impressions, 0)
      if (total < min) continue
      const real = us.filter((u) => u.impressions >= total * 0.1).sort((a, b) => b.impressions - a.impressions)
      if (real.length >= 2) cannibal.push({ query: q, impressions: total, clicks: us.reduce((s, u) => s + u.clicks, 0), pages: real.map((u) => ({ page: u.page, impressions: u.impressions, clicks: u.clicks, position: u.position })) })
    }
    cannibal = cannibal.sort((a, b) => b.impressions - a.impressions).slice(0, top)
  } else skipped.push('cannibalisation: needs rows with both query and page (the UI export has them in separate files)')

  // drops: compare with the earlier period, and say which number moved
  let drops = null
  if (previous) {
    const prevUnits = new Map(rollup(previous, unit).map((u) => [u.key, u]))
    const nowUnits = new Map(units.map((u) => [u.key, u]))
    drops = []
    for (const [k, b] of prevUnits) {
      const a = nowUnits.get(k) || { clicks: 0, impressions: 0, ctr: 0, position: null }
      const lost = b.clicks - a.clicks
      if (b.clicks < 10 || lost < Math.max(5, b.clicks * 0.2)) continue
      let why
      if (!a.impressions) why = 'gone from results: check the page still answers 200, is indexable and is in the index'
      else if (b.position != null && a.position != null && a.position - b.position >= 2) why = `ranking: position ${b.position.toFixed(1)} → ${a.position.toFixed(1)}`
      else if (a.impressions < b.impressions * 0.7) why = `demand or coverage: impressions ${b.impressions} → ${a.impressions} at a similar position (season, fewer queries, or results it no longer shows for)`
      else if (a.ctr < b.ctr * 0.7) why = `click-through: CTR ${(b.ctr * 100).toFixed(1)}% → ${(a.ctr * 100).toFixed(1)}% at a similar position and impressions (title or snippet change, or a new SERP feature above it)`
      else why = 'several small changes; no single cause'
      drops.push({ key: k, query: b.query, page: b.page, before: { clicks: b.clicks, impressions: b.impressions, ctr: b.ctr, position: b.position }, after: { clicks: a.clicks, impressions: a.impressions, ctr: a.ctr, position: a.position }, lost, why })
    }
    drops = drops.sort((x, y) => y.lost - x.lost).slice(0, top)
    const prevTotalsFrom = hasQuery ? rollup(previous, (r) => r.query || null) : rollup(previous, (r) => (r.page ? keyOf(r.page) : null))
    totals.previous = { clicks: prevTotalsFrom.reduce((s, r) => s + r.clicks, 0), impressions: prevTotalsFrom.reduce((s, r) => s + r.impressions, 0) }
  }

  // join checker findings onto pages people actually see in search
  let atRisk = null
  if (checker) {
    if (!hasPage) skipped.push('checker join: needs page rows')
    else {
      const byPage = new Map()
      for (const f of checker.findings || []) {
        if (!f.url || f.sev === 'P3') continue
        const k = keyOf(f.url)
        byPage.set(k, [...(byPage.get(k) || []), f])
      }
      atRisk = pages
        .filter((p) => byPage.has(p.key))
        .map((p) => ({ page: p.page, impressions: p.impressions, clicks: p.clicks, findings: byPage.get(p.key).map((f) => `${f.sev} ${f.id}`) }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, top)
    }
  }

  return { shape: { query: hasQuery, page: hasPage, queryAndPage: hasBoth, rows: rows.length }, min, totals, striking, lowCtr, cannibal, drops, atRisk, skipped }
}

// ---------------------------------------------------------------- report

const pct = (x) => `${(x * 100).toFixed(1)}%`
const pos = (x) => (x == null ? '—' : x.toFixed(1))
const cell = (v) => (v == null || v === '' ? '—' : String(v).replace(/\|/g, '\\|').slice(0, 80))
const what = (u) => [u.query && `"${cell(u.query)}"`, u.page && cell(keyOf(u.page))].filter(Boolean).join(' on ')

export function report(r) {
  const L = ['# Search Console analysis', '']
  const t = r.totals
  L.push(`${r.shape.rows} rows (${r.shape.queryAndPage ? 'query + page' : r.shape.query ? 'queries only' : 'pages only'}) · ${t.clicks} clicks · ${t.impressions} impressions · CTR ${pct(t.ctr)} · average position ${pos(t.position)}${t.previous ? ` · earlier period: ${t.previous.clicks} clicks, ${t.previous.impressions} impressions` : ''}`)
  L.push('', `Rows under ${r.min} impressions are left out of the lists below.`)
  L.push('', '## Striking distance (average position 8 to 20)', '')
  if (!r.striking.length) L.push('None with enough impressions.')
  else {
    L.push('| Query / page | Impressions | Clicks | Position |', '| --- | --- | --- | --- |')
    for (const u of r.striking) L.push(`| ${what(u)} | ${u.impressions} | ${u.clicks} | ${pos(u.position)} |`)
  }
  L.push('', "## Low CTR for the position (under half this site's median CTR at that position)", '')
  if (!r.lowCtr.length) L.push('None found.')
  else {
    L.push('| Query / page | Impressions | Position | CTR | Site median there |', '| --- | --- | --- | --- | --- |')
    for (const u of r.lowCtr) L.push(`| ${what(u)} | ${u.impressions} | ${pos(u.position)} | ${pct(u.ctr)} | ${pct(u.typicalCtr)} |`)
  }
  if (r.shape.queryAndPage) {
    L.push('', '## Cannibalisation (one query, several pages each with 10%+ of its impressions)', '')
    if (!r.cannibal.length) L.push('None found.')
    for (const c of r.cannibal) L.push(`- "${cell(c.query)}" (${c.impressions} impressions): ${c.pages.map((p) => `${cell(keyOf(p.page))} ${p.impressions} at ${pos(p.position)}`).join(' · ')}`)
  }
  if (r.drops) {
    L.push('', '## Lost clicks since the earlier period', '')
    if (!r.drops.length) L.push('Nothing lost 20% or more of its clicks.')
    else {
      L.push('| Query / page | Clicks before → now | Likely cause |', '| --- | --- | --- |')
      for (const d of r.drops) L.push(`| ${what(d)} | ${d.before.clicks} → ${d.after.clicks} | ${cell(d.why).slice(0, 160)} |`)
    }
  }
  if (r.atRisk) {
    L.push('', '## Pages with impressions and checker findings', '')
    if (!r.atRisk.length) L.push('No page with impressions has a P1 or P2 finding.')
    for (const a of r.atRisk) L.push(`- ${cell(keyOf(a.page))} (${a.impressions} impressions, ${a.clicks} clicks): ${a.findings.join(', ')}`)
  }
  if (r.skipped.length) L.push('', `Skipped: ${r.skipped.join('; ')}.`)
  return L.join('\n') + '\n'
}

// ---------------------------------------------------------------- main

const load = (files) => files.flatMap((f) => readRows(readFileSync(f, 'utf8')))
try {
  const rows = load(all('rows'))
  if (!rows.length) {
    console.error('No rows with impressions and a query or page column were found. Check the column names (see --help).')
    process.exit(2)
  }
  const previous = all('previous').length ? load(all('previous')) : null
  const checker = opt('checker') ? JSON.parse(readFileSync(opt('checker'), 'utf8')) : null
  const result = analyse(rows, { previous, checker, min: MIN, top: TOP })
  const md = report(result)
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(result, null, 2))
  if (opt('md')) writeFileSync(opt('md'), md)
  console.log(md)
} catch (e) {
  console.error(e.message)
  process.exit(2)
}
