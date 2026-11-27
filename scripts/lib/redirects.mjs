// redirects.mjs: read a list of old URLs (and optionally where each should
// land) and grade how each one redirects. Parsing and grading are pure; the
// caller does the fetching.

// Accepts a text or CSV file of old URLs or paths, one per line, optionally
// followed by the expected new URL or path (comma, tab or spaces between), or
// an XML sitemap (every <loc>). Blank lines and lines starting with # are skipped,
// and so is a header row whose first field is neither a URL nor a path.
export function parseRedirectList(text) {
  const out = []
  if (/<loc>/i.test(text)) {
    for (const m of text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) out.push({ old: m[1].replace(/&amp;/g, '&'), expect: null })
    return out
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [old, expect] = t.split(/\s*[,\t]\s*|\s+/).map((s) => s.replace(/^"|"$/g, ''))
    if (!/^(https?:\/\/|\/)/i.test(old)) continue
    out.push({ old, expect: expect && /^(https?:\/\/|\/)/i.test(expect) ? expect : null })
  }
  return out
}

const pathOf = (u) => {
  const x = new URL(u)
  return x.pathname + x.search
}
// Trailing slashes differ between stacks; treat /a and /a/ as the same page.
const samePath = (a, b) => a.replace(/\/+(\?|$)/, '$1') === b.replace(/\/+(\?|$)/, '$1')

// entry: { old, expect } with old and expect already absolute.
// res: the fetch result ({ status, finalUrl, chain, tooManyHops, error }).
// target: { noindex, canonical } for the final page when it answered 200, else null.
// site: { origin, local } of the site under test.
// Returns a list of { sev, id, msg } problems; empty means the redirect is right.
export function gradeRedirect(entry, res, target, site) {
  const out = []
  const add = (sev, id, msg) => out.push({ sev, id, msg })
  const oldUrl = new URL(entry.old)
  const moved = oldUrl.origin !== site.origin
  const hops = res.chain || []
  const final = res.finalUrl
  const show = hops.length ? `${hops.map((h) => `${h.status} → ${h.to}`).join(', ')}` : ''

  if (res.tooManyHops) {
    add('P1', 'redirect.loop', `Redirects more than ${hops.length - 1} times without settling (a loop or a long chain): ${show}.`)
    return out
  }
  if (!hops.length) {
    if (res.status === 200) {
      if (moved) add('P1', 'redirect.missing', `Still answers 200 on the old host instead of redirecting${entry.expect ? ` to ${entry.expect}` : ''}: two copies of the page compete and the old one keeps the links.`)
      else if (entry.expect && !samePath(pathOf(entry.old), pathOf(entry.expect))) add('P1', 'redirect.missing', `Still answers 200 instead of redirecting to ${entry.expect}.`)
    } else if (res.status === 410) add('P3', 'redirect.gone', 'Answers 410 Gone: fine for a page retired on purpose, but links to it are lost; redirect it if a page replaced it.')
    else add('P1', 'redirect.missing', `Answers ${res.status} with no redirect: its links and rankings are lost. 301 it to the page that replaced it.`)
    return out
  }
  const temp = hops.filter((h) => h.status === 302 || h.status === 303 || h.status === 307)
  if (temp.length) add('P2', 'redirect.temporary', `Uses a temporary redirect (${temp.map((h) => h.status).join(', ')}) for a permanent move; use 301 or 308 so search engines move the old URL's signals: ${show}.`)
  if (hops.length > 1) add('P2', 'redirect.chain', `${hops.length} hops before the final page: ${show}. Point the old URL straight at the final one.`)
  if (res.status !== 200) {
    add('P1', 'redirect.broken-target', `Redirects to ${final}, which answers ${res.status || res.error}.`)
    return out
  }
  const finalUrl = new URL(final)
  if (entry.expect) {
    const want = new URL(entry.expect)
    const hostOk = site.local || want.origin === finalUrl.origin
    if (!hostOk || !samePath(pathOf(want.href), pathOf(final))) add('P1', 'redirect.wrong-target', `Lands on ${final}, not the intended ${entry.expect}.`)
  } else if (finalUrl.pathname === '/' && oldUrl.pathname !== '/') {
    add('P2', 'redirect.to-home', `Redirects to the home page. Google treats a redirect to an unrelated page as a soft 404; send it to the closest matching page or let it 404.`)
  }
  if (!site.local && !entry.expect && finalUrl.origin !== site.origin) add('P2', 'redirect.off-site', `Lands on ${finalUrl.origin}, not ${site.origin}.`)
  if (target?.noindex) add('P1', 'redirect.target-noindex', `Redirects to ${final}, which is noindex: the moved page drops out of search.`)
  else if (target?.canonical && !samePath(pathOf(new URL(target.canonical, final).href), pathOf(final))) add('P2', 'redirect.target-canonical', `Redirects to ${final}, whose canonical points elsewhere (${target.canonical}): redirect to the canonical URL instead.`)
  return out
}
