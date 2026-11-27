// Programmatic (template) pages: groups of sitemap URLs that share a URL pattern,
// and how much of each sampled page's text is its own. Pure functions; the
// checker does the fetching.

const COMPARE = /(^|[-_])(vs|versus)([-_]|$)|(^|[-_])alternatives?([-_]|$)|^compare([-_]|$)/i

// /tools/json-to-csv -> /tools/*; top-level slugs only group by a comparison shape.
export function patternOf(pathname) {
  const segs = pathname.split('/').filter(Boolean)
  if (!segs.length) return null
  if (segs.length === 1) {
    if (/[-_]vs[-_]/i.test(segs[0])) return '/*-vs-*'
    if (/(^|[-_])alternatives?([-_]|$)/i.test(segs[0])) return '/*alternatives*'
    return null
  }
  return `/${segs.slice(0, -1).join('/')}/*`
}

export const isComparison = (url) => {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).some((s) => COMPARE.test(s))
  } catch {
    return false
  }
}

// Groups of at least `min` URLs that share a pattern, largest first.
export function templateGroups(urls, { min = 8 } = {}) {
  const groups = new Map()
  for (const u of urls) {
    let p
    try {
      p = patternOf(new URL(u).pathname)
    } catch {
      continue
    }
    if (!p) continue
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p).push(u)
  }
  return [...groups]
    .filter(([, us]) => us.length >= min)
    .map(([pattern, us]) => ({ pattern, urls: us, comparison: us.filter(isComparison).length >= us.length / 2 }))
    .sort((a, b) => b.urls.length - a.urls.length)
}

// `n` URLs spread evenly through a list.
export function spread(list, n) {
  if (list.length <= n) return [...list]
  const step = list.length / n
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)])
}

const words = (text) => (text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)

export function shingles(text, n = 5) {
  const w = words(text)
  const s = new Set()
  for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' '))
  return s
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 1
  let both = 0
  for (const x of a) if (b.has(x)) both++
  return both / (a.size + b.size - both)
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}

// Site chrome: phrases on the home page that also appear on at least half of the
// other sampled pages (header, footer, sidebar). Template copy isn't on the home page.
export function chrome(homeText, otherTexts) {
  const home = shingles(homeText)
  const others = otherTexts.map((t) => shingles(t))
  const out = new Set()
  if (!others.length) return out
  for (const s of home) if (others.filter((o) => o.has(s)).length >= others.length / 2) out.add(s)
  return out
}

// One group's sampled pages: [{ url, text }]. Returns the median similarity of
// each page pair, the most alike pair, and each page's own words (text outside
// the site chrome, counted as five-word phrases, about one per word).
export function measureGroup(pages, chromeSet) {
  const own = pages.map((p) => {
    const s = shingles(p.text)
    for (const c of chromeSet) s.delete(c)
    return { url: p.url, s }
  })
  const pairs = []
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) pairs.push({ a: own[i].url, b: own[j].url, similarity: jaccard(own[i].s, own[j].s) })
  pairs.sort((x, y) => y.similarity - x.similarity)
  return {
    sampled: own.length,
    similarity: pairs.length ? +median(pairs.map((p) => p.similarity)).toFixed(2) : null,
    closest: pairs[0] ? { ...pairs[0], similarity: +pairs[0].similarity.toFixed(2) } : null,
    ownWords: median(own.map((o) => o.s.size)),
  }
}

export const NEAR_DUPLICATE = 0.6
export const THIN_WORDS = 200
export const BLOAT_SHARE = 0.5

// Findings for measured groups: [{ pattern, urls, share, sampled, similarity, closest, ownWords, comparison }].
export function templateFindings(groups) {
  const out = []
  const ex = (g) => `${g.pattern}, ${g.urls.length} sitemap URL(s)`
  for (const g of groups) {
    if (g.sampled < 3) continue
    const dup = g.similarity >= NEAR_DUPLICATE
    const thin = g.ownWords < THIN_WORDS
    if (dup) out.push({ sev: 'P2', id: 'programmatic.near-duplicate', url: g.closest.a, msg: `Pages in ${ex(g)} are ${Math.round(g.similarity * 100)}% alike once the site's header and footer are set aside (most alike: ${g.closest.a} and ${g.closest.b}, ${Math.round(g.closest.similarity * 100)}%). Google folds near-duplicates together and may index few of them; give each page data or copy that only it has, or noindex and consolidate the weakest.` })
    if (thin) out.push({ sev: 'P3', id: 'programmatic.thin', url: g.urls[0], msg: `Pages in ${ex(g)} have about ${g.ownWords} words of their own (median of ${g.sampled} sampled). Template pages need enough unique substance to answer the query on their own.` })
    if ((dup || thin) && g.share >= BLOAT_SHARE) out.push({ sev: 'P2', id: 'programmatic.bloat', url: g.urls[0], msg: `${Math.round(g.share * 100)}% of the sitemap is ${g.pattern} template pages that look ${dup ? 'near-duplicate' : 'thin'}. A sitemap mostly of weak template pages wastes crawl budget and can pull down how Google rates the whole site; list only the pages worth indexing.` })
  }
  return out
}
