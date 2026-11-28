// Crawlspace's portfolio covers: one scene, drawn twice (2400 × 800 and 1000 × 800).
//
// Verb: Crawlspace *walks* a site and shows where the crawler got stuck. Picture:
// the site's map drawn top-down on blueprint paper, pages as nodes joined by dashed
// links. A cyan trail runs from the root down every branch it could follow; on one
// branch it stops at a page ringed in amber (the finding), and the two pages behind
// that page stay grey, never reached. The nodes and the amber flag are the mark's
// own idea, so the logo is part of the scene rather than a badge on it.
//
//   node draw.mjs        writes cover.svg and cover-mobile.svg next to this file
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = process.env.BRAND_KIT || '/home/claude/mtblck/brand-kit/skills/logo'
const { svg, write } = await import(join(KIT, 'scripts/brand.mjs'))
const here = dirname(fileURLToPath(import.meta.url))

const C = {
  blueprint: '#0b1424', grid: '#14213a', panel: '#0d1a2e', raise: '#13233d', edge: '#2c3d5e',
  signal: '#5ad1e6', flag: '#f2b84b', muted: '#a9b8cf',
}
const ALT = 'A site map drawn on blueprint paper, its pages joined by dashed lines, with a cyan trail running from the root down every branch until it stops at one page ringed in amber, and the two pages behind it still grey and unreached.'

/** A page node: a disc with a ring and three text lines; `state` is visited, flag or idle. */
function node(x, y, r, state) {
  const ring = state === 'visited' ? C.signal : state === 'flag' ? C.flag : C.edge
  const fill = state === 'idle' ? C.panel : C.raise
  const line = state === 'idle' ? C.edge : C.muted
  const lw = r * 0.9, lh = 10
  const rows = [[-0.32, 0.62, line], [0, 0.9, state === 'flag' ? C.flag : line], [0.32, 0.5, line]]
  let s = ''
  if (state === 'flag') s += `<circle cx="${x}" cy="${y}" r="${r + 26}" fill="none" stroke="${C.flag}" stroke-width="6" stroke-dasharray="12 10"/>`
  s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${ring}" stroke-width="8"/>`
  for (const [dy, w, col] of rows) s += `<rect x="${(x - lw / 2).toFixed(1)}" y="${(y + dy * r - lh / 2).toFixed(1)}" width="${(lw * w).toFixed(1)}" height="${lh}" rx="5" fill="${col}"/>`
  return s
}

/** A link from parent to child as a soft vertical S-curve. */
const link = (a, b) => `M${a.x} ${a.y}C${a.x} ${(a.y + b.y) / 2} ${b.x} ${(a.y + b.y) / 2} ${b.x} ${b.y}`

function scene(W, H, { r, nodes, title }) {
  const cx = W / 2
  const pts = nodes.map((n) => ({ ...n, x: cx + n.dx, y: n.y }))
  const parts = [`<rect width="${W}" height="${H}" fill="${C.blueprint}"/>`]
  // Blueprint grid, 40 apart, the site's own ground.
  let g = ''
  for (let x = 40; x < W; x += 40) g += `M${x} 0V${H}`
  for (let y = 40; y < H; y += 40) g += `M0 ${y}H${W}`
  parts.push(`<path d="${g}" stroke="${C.grid}" stroke-width="2" fill="none"/>`)
  // Every link dashed; the crawler's trail solid over the links it followed.
  let dashed = '', trail = ''
  for (const n of pts) {
    if (n.parent == null) continue
    const p = pts[n.parent]
    dashed += link(p, n)
    if (p.state !== 'idle' && p.state !== 'flag' && n.state !== 'idle') trail += link(p, n)
  }
  parts.push(`<path d="${dashed}" fill="none" stroke="${C.edge}" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 16"/>`)
  parts.push(`<path d="${trail}" fill="none" stroke="${C.signal}" stroke-width="8" stroke-linecap="round"/>`)
  for (const n of pts) parts.push(node(n.x, n.y, r, n.state))
  return svg({ w: W, h: H, title, body: parts.join('') })
}

// Wide: root, four sections, and their pages; the flag on the third section.
const wide = [
  { dx: 0, y: 150, state: 'visited' },
  { dx: -600, y: 390, parent: 0, state: 'visited' },
  { dx: -200, y: 390, parent: 0, state: 'visited' },
  { dx: 200, y: 390, parent: 0, state: 'flag' },
  { dx: 600, y: 390, parent: 0, state: 'visited' },
  { dx: -720, y: 630, parent: 1, state: 'visited' },
  { dx: -480, y: 630, parent: 1, state: 'visited' },
  { dx: -200, y: 630, parent: 2, state: 'visited' },
  { dx: 80, y: 630, parent: 3, state: 'idle' },
  { dx: 320, y: 630, parent: 3, state: 'idle' },
  { dx: 600, y: 630, parent: 4, state: 'visited' },
]
// Phone: the same map with three sections, moved in toward the middle.
const phone = [
  { dx: 0, y: 150, state: 'visited' },
  { dx: -280, y: 390, parent: 0, state: 'visited' },
  { dx: 0, y: 390, parent: 0, state: 'visited' },
  { dx: 280, y: 390, parent: 0, state: 'flag' },
  { dx: -310, y: 630, parent: 1, state: 'visited' },
  { dx: -100, y: 630, parent: 2, state: 'visited' },
  { dx: 140, y: 630, parent: 3, state: 'idle' },
  { dx: 320, y: 630, parent: 3, state: 'idle' },
]

write(join(here, 'cover.svg'), scene(2400, 800, { r: 64, nodes: wide, title: ALT }))
write(join(here, 'cover-mobile.svg'), scene(1000, 800, { r: 62, nodes: phone, title: ALT }))
