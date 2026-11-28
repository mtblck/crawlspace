// Crawlspace: SEO audits for Claude Code that walk a site the way a crawler does.
// The mark is the one already in the site's header (mattblack.space/skills/crawlspace),
// redrawn on the brand-kit grid: a crawl map of three pages, the root and two links,
// joined by two edges at 60°, with the page where the crawler got stuck flagged in amber.
//
// On a 256 grid: an equilateral triangle of side 160 with its apex at (128, 52),
// nodes of radius 30 on its corners, edges 16 wide. The base edge is left open:
// a crawl map is a tree, not a loop.
//
//   BRAND_KIT=<brand-kit>/skills/logo node draw.mjs
//   node $BRAND_KIT/scripts/export.mjs brand.json
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = process.env.BRAND_KIT || '/home/claude/mtblck/brand-kit/skills/logo'
const { loadFont, lockup, svg, write, circle, limb } = await import(join(KIT, 'scripts/brand.mjs'))
const { union, bounds } = await import(join(KIT, 'scripts/geometry.mjs'))
const here = dirname(fileURLToPath(import.meta.url))
const out = (f) => join(here, f)

const C = {
  blueprint: '#0b1424', // the site's page
  survey: '#007a8a', // the site's cyan, darkened to 5:1 on white for light grounds
  signal: '#5ad1e6', // the site's cyan
  flag: '#f2b84b', // the site's amber
  tracing: '#eef3f9', // light page; the wordmark on Blueprint
}

// Geometry on the 256 grid.
const SIDE = 160, R = 30, EDGE = 16
const A = [128, 52]
const H = (SIDE * Math.sqrt(3)) / 2 // 138.56
const L = [128 - SIDE / 2, 52 + H], Rt = [128 + SIDE / 2, 52 + H]
const edges = union(limb(...A, ...L, EDGE), limb(...A, ...Rt, EDGE))
const ink = union(edges, circle(...A, R), circle(...L, R))
const flag = circle(...Rt, R)
const bb = bounds(union(ink, flag))
const markBody = (line, acc) => `<g transform="translate(${-bb.x} ${-bb.y})"><path d="${ink}" fill="${line}"/><path d="${flag}" fill="${acc}"/></g>`
const mark = (line, acc) => ({ body: markBody(line, acc), w: bb.w, h: bb.h })

write(out('mark.svg'), svg({ w: bb.w, h: bb.h, title: 'Crawlspace', body: markBody(C.survey, C.flag) }))
write(out('mark-dark.svg'), svg({ w: bb.w, h: bb.h, title: 'Crawlspace', body: markBody(C.signal, C.flag) }))

// Favicon: the same map with heavier edges (24) so they survive 16 px, on a Blueprint tile.
{
  const fe = union(limb(...A, ...L, 24), limb(...A, ...Rt, 24), circle(...A, R + 2), circle(...L, R + 2))
  const ff = circle(...Rt, R + 2)
  const b = bounds(union(fe, ff))
  const s = 256, pad = 26, k = (s - 2 * pad) / Math.max(b.w, b.h)
  const tx = (s - b.w * k) / 2 - b.x * k, ty = (s - b.h * k) / 2 - b.y * k
  write(out('favicon.svg'), svg({ w: s, h: s, title: 'Crawlspace', body: `<rect width="${s}" height="${s}" rx="56" fill="${C.blueprint}"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})"><path d="${fe}" fill="${C.signal}"/><path d="${ff}" fill="${C.flag}"/></g>` }))
}

const font = await loadFont('Space Grotesk', 700)
for (const [layout, file, gap] of [['horizontal', 'logo-horizontal', 0.26], ['stacked', 'logo-stacked', 0.26]]) {
  for (const [suffix, line, word] of [['', C.survey, C.blueprint], ['-dark', C.signal, C.tracing]]) {
    const l = lockup({ mark: mark(line, C.flag), font, name: 'Crawlspace', layout, gap, color: word, tracking: -0.02 })
    write(out(`${file}${suffix}.svg`), svg({ w: l.w, h: l.h, title: 'Crawlspace', body: l.body }))
  }
}

write(out('brand.json'), JSON.stringify({
  name: 'Crawlspace',
  tagline: 'Find out where crawlers get stuck.',
  about: 'Crawlspace is a free set of SEO skills for Claude Code. It walks a site the way a crawler does, fetching every page raw and rendered, reads the code that made them, and proves each finding.\n\nThe mark is a crawl map: the root page and two links, with the one where the crawler got stuck flagged in amber.',
  construction: 'On a 256 grid: an equilateral triangle of side 160 with its apex at (128, 52), nodes of radius 30 on its corners and two edges 16 wide; the base is left open, because a crawl map is a tree.',
  website: 'mattblack.space/skills/crawlspace',
  contact: { name: 'Your Name', role: 'Role', email: 'you@mattblack.space' },
  colors: [
    { name: 'Blueprint', hex: C.blueprint, role: 'dark', usage: 'The page, the brand field and the icon tile: Crawlspace lives on Blueprint first.' },
    { name: 'Survey', hex: C.survey, role: 'primary', usage: 'The mark and brand-coloured text on light grounds.' },
    { name: 'Flag', hex: C.flag, role: 'accent', usage: 'The flagged node and one highlight per layout (a finding, a call to action); never body text on light grounds.' },
    { name: 'Tracing', hex: C.tracing, role: 'paper', usage: 'Light pages, and the wordmark on Blueprint.' },
    { name: 'Signal', hex: C.signal, role: 'support', usage: 'The mark on Blueprint, and primary buttons in both themes (with Blueprint labels).' },
  ],
  type: { display: { family: 'Space Grotesk', weight: 700 }, text: { family: 'Space Grotesk', weight: 400 } },
  logos: {
    mark: { file: 'mark.svg', dark: 'mark-dark.svg', minWidth: 16 },
    horizontal: { file: 'logo-horizontal.svg', dark: 'logo-horizontal-dark.svg', minWidth: 110 },
    stacked: { file: 'logo-stacked.svg', dark: 'logo-stacked-dark.svg', minWidth: 64 },
  },
  icon: { file: 'mark-dark.svg', background: C.blueprint, favicon: 'favicon.svg' },
  social: { background: C.tracing },
  palette: { brand: C.signal },
  templates: { background: C.blueprint },
  portfolio: {
    cover: 'portfolio/cover.svg',
    mobile: 'portfolio/cover-mobile.svg',
    alt: 'A site map drawn on blueprint paper, its pages joined by dashed lines, with a cyan trail running from the root down every branch until it stops at one page ringed in amber, and the two pages behind it still grey and unreached.',
  },
  direction: {
    words: ['technical', 'exact', 'calm'],
    pairs: { tone: 'serious', era: 'modern', volume: 'quiet', finish: 'engineered' },
    references: { like: ['the Crawl Map site'], avoid: ['magnifying glasses', 'rising bar charts', 'search-bar logos'] },
    lives: 'web',
    weirdness: 2,
  },
  legal: { owner: 'mtblck', contact: 'github.com/mtblck/crawlspace' },
  clearSpace: 0.25,
  exports: 'all',
  out: 'dist',
}, null, 2) + '\n')
console.log('mark', bb)
