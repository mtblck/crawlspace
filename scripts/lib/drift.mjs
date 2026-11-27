// drift.mjs: compare a seo-check run against a saved baseline run (both the
// --json output) and say what regressed and what changed. Pure functions, no I/O.
//
// Pages are matched by path + query, so a production baseline can be compared
// with a local build or a preview deploy of the same site.

const keyOf = (u) => {
  try {
    const x = new URL(u)
    return x.pathname + x.search
  } catch {
    return u
  }
}
const isNoindex = (robots) => /\b(noindex|none)\b/i.test(robots || '')
const same = (a, b) => (a ?? null) === (b ?? null)

// Paths to fetch again so every baseline page is compared, not just the ones the
// new sample happens to pick.
export function baselinePaths(baseline) {
  return (baseline?.pages || []).map((p) => keyOf(p.url))
}

export function validBaseline(b) {
  return !!b && Array.isArray(b.pages) && Array.isArray(b.findings)
}

// Returns { findings, changes, pages, score, kinds }.
// findings: regressions as { sev, id, msg, url } for the caller to add to the run.
// changes: differences that may well be intended, for a person to confirm.
export function compareRuns(before, after) {
  const findings = []
  const changes = []
  const add = (sev, id, msg, url) => findings.push({ sev, id, msg, url })
  const change = (url, field, from, to) => changes.push({ url, field, from: from ?? null, to: to ?? null })

  const now = new Map(after.pages.map((p) => [keyOf(p.url), p]))
  let compared = 0
  const notChecked = []
  for (const b of before.pages) {
    const k = keyOf(b.url)
    const a = now.get(k)
    if (!a) {
      notChecked.push(k)
      continue
    }
    compared++
    const url = a.url
    if (b.status === 200 && a.status !== 200) {
      add('P1', 'drift.status', `Answered 200 at the baseline and now answers ${a.status || 'nothing'}.`, url)
      continue
    }
    if (b.status !== 200 && a.status === 200) change(url, 'status', b.status, a.status)
    if (b.status !== 200 || a.status !== 200) continue

    const bNo = isNoindex(b.robots)
    const aNo = isNoindex(a.robots)
    if (!bNo && aNo) {
      add('P1', 'drift.noindex', `Indexable at the baseline, now noindex (${a.robots}).`, url)
      continue // a noindex page isn't checked further, so nothing else compares
    } else if (bNo && !aNo) change(url, 'robots', b.robots, a.robots)

    const bc = b.canonical ? keyOf(b.canonical) : null
    const ac = a.canonical ? keyOf(a.canonical) : null
    if (bc !== ac) {
      if (bc === k && ac) add('P1', 'drift.canonical', `Canonical was itself, now points to ${a.canonical}: this page drops out of the index in favour of that one.`, url)
      else if (bc && !ac) add('P2', 'drift.canonical-lost', `Had a canonical (${b.canonical}) at the baseline, now has none.`, url)
      else change(url, 'canonical', b.canonical, a.canonical)
    }

    const lost = (b.schemaTypes || []).filter((t) => !(a.schemaTypes || []).includes(t))
    if (lost.length) add('P2', 'drift.schema-lost', `Structured data types gone since the baseline: ${lost.join(', ')}.`, url)
    const gained = (a.schemaTypes || []).filter((t) => !(b.schemaTypes || []).includes(t))
    if (gained.length) change(url, 'schema', (b.schemaTypes || []).join(', '), (a.schemaTypes || []).join(', '))

    // content: the served HTML is what non-rendering crawlers see, so compare it first
    if (b.wordsRaw >= 150 && a.wordsRaw != null && a.wordsRaw < b.wordsRaw / 2) {
      add('P2', 'drift.content-lost', `The served HTML had ${b.wordsRaw} words at the baseline and has ${a.wordsRaw} now.`, url)
    } else if (b.wordsRendered >= 150 && a.wordsRendered != null && a.wordsRendered < b.wordsRendered / 2) {
      add('P2', 'drift.content-lost', `The rendered page had ${b.wordsRendered} words at the baseline and has ${a.wordsRendered} now.`, url)
    }

    const bImg = b.social?.image || null
    const aImg = a.social?.image || null
    if (bImg && !aImg) add('P2', 'drift.social-image-lost', `Had a share image (${bImg}) at the baseline, now has none: shared links lose their picture.`, url)
    else if (bImg && aImg && keyOf(bImg) !== keyOf(aImg)) change(url, 'og:image', bImg, aImg)

    const bTitle = b.title ?? b.renderedTitle
    const aTitle = a.title ?? a.renderedTitle
    if (!same(bTitle, aTitle)) change(url, 'title', bTitle, aTitle)
    if (!same(b.description, a.description)) change(url, 'description', b.description, a.description)
    const bh = (b.h1 || []).join(' | ')
    const ah = (a.h1 || []).join(' | ')
    if (bh !== ah) change(url, 'h1', bh || null, ah || null)
  }

  // site level
  const crawlersNow = new Map((after.crawlers || []).map((c) => [c.agent, c]))
  for (const c of before.crawlers || []) {
    const n = crawlersNow.get(c.agent)
    if (!n || n.allowed === c.allowed) continue
    if (c.allowed && !n.allowed) {
      if (c.kind === 'search') add('P1', 'drift.robots-search', `robots.txt now blocks ${c.agent} from the home page (${n.rule}); it was allowed at the baseline.`, after.robots?.finalUrl || null)
      else add('P3', 'drift.robots-ai', `robots.txt now blocks ${c.agent} (${n.rule}); it was allowed at the baseline. Fine if intended.`, after.robots?.finalUrl || null)
    } else change('robots.txt', c.agent, 'blocked', 'allowed')
  }
  const bCount = before.sitemaps?.urlCount ?? 0
  const aCount = after.sitemaps?.urlCount ?? 0
  if (bCount >= 5 && aCount < bCount * 0.8) add('P2', 'drift.sitemap-shrank', `The sitemap listed ${bCount} URLs at the baseline and lists ${aCount} now.`, null)
  else if (bCount !== aCount) change('sitemap', 'URL count', bCount, aCount)

  const kindsOf = (r) => new Set((r.findings || []).map((f) => f.id).filter((id) => !id.startsWith('drift.')))
  const bk = kindsOf(before)
  const ak = kindsOf(after)
  return {
    baseline: { url: before.url, startedAt: before.startedAt, tool: before.tool },
    pages: { compared, notChecked },
    score: { before: before.score ?? null },
    kinds: { new: [...ak].filter((k) => !bk.has(k)).sort(), fixed: [...bk].filter((k) => !ak.has(k)).sort() },
    findings,
    changes,
  }
}
