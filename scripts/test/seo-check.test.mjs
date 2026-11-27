// node --test "scripts/test/*.test.mjs"
// Serves a small site with known problems on localhost and checks that
// seo-check.mjs reports each one, and nothing it shouldn't.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'seo-check.mjs')

const page = ({ title, desc, canonical, h1 = 'Heading', lang = 'en', extraHead = '', body = '', og = '<meta property="og:title" content="x"><meta property="og:image" content="OGIMG">' }) => `<!doctype html>
<html${lang ? ` lang="${lang}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${title ? `<title>${title}</title>` : ''}
${desc ? `<meta name="description" content="${desc}">` : ''}
${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
${og}
${extraHead}
</head><body>${h1 ? `<h1>${h1}</h1>` : ''}${body}<p>${'Plenty of words about the subject. '.repeat(30)}</p>
<a href="/">Home</a> <a href="/about">About</a> <a href="/gone">Gone</a></body></html>`

// PNG header only: enough for the size sniffer
const png = (w, h) => {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12)
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

function site(port, tweak) {
  const o = `http://localhost:${port}`
  const images = { '/icon.png': png(32, 32), '/og.png': png(1200, 630), '/small.png': png(100, 100), '/card.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' }
  const routes = {
    '/robots.txt': [200, 'text/plain', `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: OAI-SearchBot\nDisallow: /\n\nSitemap: ${o}/sitemap.xml\n`],
    '/sitemap.xml': [200, 'application/xml', `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/about', '/dup-a', '/dup-b', '/secret', '/old', '/fr', '/en'].map((p) => `<url><loc>${o}${p}</loc><lastmod>2026-01-01</lastmod></url>`).join('\n')}
</urlset>`],
    '/': [200, 'text/html', page({ title: 'Home of the fixture site', desc: 'A fixture site used to test the seo-check script end to end.', canonical: `${o}/`, extraHead: '<link rel="icon" href="/icon.png"><link rel="manifest" href="/site.webmanifest"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Fixture"}</script>' })],
    '/site.webmanifest': [200, 'application/manifest+json', JSON.stringify({ name: 'Fixture', icons: [{ src: '/icon.png', sizes: '192x192' }] })],
    '/about': [200, 'text/html', page({ title: 'About the fixture', desc: null, canonical: `${o}/about`, h1: null, lang: null, og: '<meta property="og:image" content="/small.png">', body: '<img src="/a.png"><h1>One</h1><h1>Two</h1><h4>Skip</h4><a href="/Old_Page?ref=nav">old</a>' })],
    '/dup-a': [200, 'text/html', page({ title: 'Same title for two pages', desc: 'Shared description for both duplicate pages in this fixture.', canonical: `${o}/dup-a`, og: `<meta property="og:title" content="t"><meta property="og:image" content="${o}/card.svg">`, extraHead: '<script type="application/ld+json">{ broken </script>' })],
    '/dup-b': [200, 'text/html', page({ title: 'Same title for two pages', desc: 'Shared description for both duplicate pages in this fixture.', canonical: `${o}/missing` })],
    '/secret': [200, 'text/html', page({ title: 'Secret page here', desc: 'This page should not be indexed but sits in the sitemap anyway.', canonical: `${o}/secret`, extraHead: '<meta name="robots" content="noindex">' })],
    '/old': [301, 'text/html', '', { location: '/about' }],
    '/fr': [200, 'text/html', page({ title: 'Page en français', desc: 'Une page de test pour vérifier les liens hreflang réciproques.', canonical: `${o}/fr`, lang: 'fr', og: `<meta property="og:image" content="${o}/broken.png">`, extraHead: `<link rel="alternate" hreflang="fr" href="${o}/fr"><link rel="alternate" hreflang="en-UK" href="${o}/en">` })],
    '/en': [200, 'text/html', page({ title: 'English page', desc: 'An English test page that forgets to link back to the French one.', canonical: `${o}/en`, extraHead: `<link rel="alternate" hreflang="en" href="${o}/en">` })],
  }
  for (const r of Object.values(routes)) if (typeof r[2] === 'string') r[2] = r[2].replace('OGIMG', `${o}/og.png`)
  tweak?.(routes, o)
  return createServer((req, res) => {
    const path = new URL(req.url, o).pathname
    if (images[path]) {
      res.writeHead(200, { 'content-type': path.endsWith('.svg') ? 'image/svg+xml' : 'image/png' })
      return res.end(images[path])
    }
    if (path === '/gone' || path === '/missing' || path === '/broken.png') return res.writeHead(404).end()
    const r = routes[path]
    if (!r) {
      // SPA-style fallback: every unknown path gets the shell with 200
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end('<!doctype html><html><head><title>App</title></head><body><div id="root"></div></body></html>')
    }
    res.writeHead(r[0], { 'content-type': r[1], ...(r[3] || {}) })
    res.end(r[2])
  })
}

test('reports the planted problems', async () => {
  const server = site(0)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  server.close()
  const real = site(port)
  await new Promise((r) => real.listen(port, '127.0.0.1', r))
  const out = join(mkdtempSync(join(tmpdir(), 'seo-check-')), 'r.json')
  const code = await new Promise((resolve) =>
    execFile('node', [SCRIPT, '--url', `http://localhost:${port}/`, '--render', 'off', '--delay', '0', '--crawl', '50', '--json', out], (err) => resolve(err ? err.code : 0)),
  )
  real.close()
  const r = JSON.parse(readFileSync(out, 'utf8'))
  const ids = new Set(r.findings.map((f) => f.id))
  assert.equal(code, 1, 'exits 1 when there is a P1')
  for (const id of [
    'robots.blocks-ai-search', 'sitemap.lastmod-uniform', 'soft-404', 'description.missing', 'html.lang', 'h1.multiple',
    'headings.skip', 'img.alt', 'img.dimensions', 'jsonld.invalid', 'title.duplicate', 'description.duplicate',
    'crawl.orphan', 'url.uppercase', 'url.underscore', 'url.params',
    'canonical.bad-target', 'social.image-relative', 'social.image-small', 'social.image-svg', 'social.image-broken',
    'icons.favicon-small', 'icons.apple-touch', 'icons.manifest-icons', 'icons.theme-color',
    'social.og-title', 'social.og-description', 'social.twitter-card', 'page.noindex-in-sitemap', 'sitemap.redirect', 'hreflang.code', 'hreflang.return', 'links.broken',
  ]) assert.ok(ids.has(id), `expected ${id}; got ${[...ids].join(', ')}`)
  assert.ok(r.crawl.orphans.some((u) => u.endsWith('/secret')), 'secret is an orphan')
  assert.equal(r.crawl.capped, false)
  const home = r.pages.find((p) => p.url.endsWith(`${port}/`))
  assert.equal(home.social.imageSize, '1200×630')
  assert.ok(!r.findings.some((f) => f.url === home.url && /^social\.image-(broken|small|svg|relative|type|heavy|ratio)/.test(f.id)), 'home og:image is fine')
  for (const id of ['icons.favicon-missing', 'icons.manifest-broken', 'robots.blocks-search', 'title.missing', 'html.viewport', 'canonical.conflict']) assert.ok(!ids.has(id), `did not expect ${id}`)
  const gpt = r.crawlers.find((c) => c.agent === 'GPTBot')
  const google = r.crawlers.find((c) => c.agent === 'Googlebot')
  assert.equal(gpt.allowed, false)
  assert.equal(google.allowed, true)
  assert.deepEqual(r.pages.find((p) => p.url.endsWith(`${port}/`)).schemaTypes, ['Organization'])
})

async function run(tweak, args) {
  const server = site(0)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  server.close()
  const real = site(port, tweak)
  await new Promise((r) => real.listen(port, '127.0.0.1', r))
  const out = join(mkdtempSync(join(tmpdir(), 'seo-check-')), 'r.json')
  const md = out.replace(/json$/, 'md')
  const code = await new Promise((resolve) =>
    execFile('node', [SCRIPT, '--url', `http://localhost:${port}/`, '--render', 'off', '--delay', '0', '--max-links', '0', '--json', out, '--md', md, ...args], (err) => resolve(err ? err.code : 0)),
  )
  real.close()
  return { code, r: JSON.parse(readFileSync(out, 'utf8')), md: readFileSync(md, 'utf8'), out }
}

test('--baseline grades regressions and lists changes', async () => {
  const before = await run(null, ['--max', '4', '--pages', '/about,/dup-a'])
  assert.equal(before.r.drift, null)
  const after = await run((routes, o) => {
    routes['/robots.txt'][2] = routes['/robots.txt'][2].replace('User-agent: *\nAllow: /', 'User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /')
    routes['/'][2] = routes['/'][2]
      .replace('<title>Home of the fixture site</title>', '<title>A new home title</title>')
      .replace(/<script type="application\/ld\+json">[^<]*<\/script>/, '')
      .replace(`<link rel="canonical" href="${o}/">`, `<link rel="canonical" href="${o}/about">`)
    routes['/about'][2] = routes['/about'][2].replace('<head>', '<head><meta name="robots" content="noindex">')
    routes['/dup-a'] = [500, 'text/html', 'down']
  }, ['--max', '1', '--baseline', before.out])
  const ids = after.r.findings.filter((f) => f.id.startsWith('drift.')).map((f) => `${f.id} ${new URL(f.url || 'http://x/robots.txt').pathname}`)
  assert.equal(after.code, 1)
  for (const want of ['drift.canonical /', 'drift.schema-lost /', 'drift.noindex /about', 'drift.status /dup-a', 'drift.robots-search /robots.txt'])
    assert.ok(ids.includes(want), `expected ${want}; got ${ids.join(', ')}`)
  assert.ok(!ids.some((i) => i.startsWith('drift.schema-lost /about')), 'a page that became noindex is not compared further')
  assert.equal(after.r.drift.pages.compared, before.r.pages.length, 'every baseline page is fetched again despite --max 1')
  assert.ok(after.r.drift.changes.some((c) => c.field === 'title' && c.to === 'A new home title'))
  assert.equal(after.r.drift.score.before, before.r.score)
  assert.ok(after.r.drift.kinds.new.includes('robots.blocks-search'))
  assert.match(after.md, /## Drift since the baseline/)

  const same = await run(null, ['--max', '1', '--baseline', before.out])
  assert.deepEqual(same.r.drift.findings, [], 'an unchanged site has no drift')
  assert.deepEqual(same.r.drift.changes, [])
})

test('--redirects grades each old URL', async () => {
  const server = site(0)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  server.close()
  const go = (to, status = 301) => [status, 'text/html', '', { location: to }]
  const real = site(port, (routes) => {
    Object.assign(routes, {
      '/moved-ok': go('/en'), '/moved-temp': go('/en', 302), '/chain1': go('/chain2'), '/chain2': go('/en'),
      '/to-home': go('/'), '/to-noindex': go('/secret'), '/to-dead': go('/gone'), '/loop-a': go('/loop-b'), '/loop-b': go('/loop-a'),
      '/wrong': go('/fr'), '/to-dup-b': go('/dup-b'), '/retired': [410, 'text/html', 'gone'],
    })
  })
  await new Promise((r) => real.listen(port, '127.0.0.1', r))
  const dir = mkdtempSync(join(tmpdir(), 'seo-redirects-'))
  writeFileSync(join(dir, 'old.csv'), ['old,new', '/moved-ok,/en/', '/moved-temp', '/chain1', '/to-home', '/to-noindex', '/to-dead', '/loop-a', '/wrong,/en', '/to-dup-b', '/gone', '/retired', '/about,/en', '# a comment', ''].join('\n'))
  const out = join(dir, 'r.json')
  await new Promise((resolve) =>
    execFile('node', [SCRIPT, '--url', `http://localhost:${port}/`, '--render', 'off', '--delay', '0', '--max', '1', '--max-links', '0', '--redirects', join(dir, 'old.csv'), '--json', out], () => resolve()),
  )
  real.close()
  const r = JSON.parse(readFileSync(out, 'utf8'))
  const got = r.findings.filter((f) => f.id.startsWith('redirect.')).map((f) => `${new URL(f.url).pathname} ${f.id}`).sort()
  assert.deepEqual(got, [
    '/about redirect.missing', '/chain1 redirect.chain', '/gone redirect.missing', '/loop-a redirect.loop', '/moved-temp redirect.temporary',
    '/retired redirect.gone', '/to-dead redirect.broken-target', '/to-dup-b redirect.target-canonical', '/to-home redirect.to-home',
    '/to-noindex redirect.target-noindex', '/wrong redirect.wrong-target',
  ])
  assert.equal(r.redirects.listed, 12)
  assert.equal(r.redirects.ok, 1, 'only /moved-ok is right (trailing slash ignored)')
})

test('checklist.mjs builds the checklist and carries ticks over', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-checklist-'))
  const run = { tool: 'seo-check test', url: 'https://example.com/', startedAt: '2026-11-11T00:00:00Z', findings: [
    { sev: 'P1', id: 'page.noindex-in-sitemap', msg: 'Page is noindex but listed in the sitemap.', url: 'https://example.com/a' },
    { sev: 'P2', id: 'img.alt', msg: '2 image(s) without an alt attribute.', url: 'https://example.com/a' },
    { sev: 'P2', id: 'img.alt', msg: '1 image(s) without an alt attribute.', url: 'https://example.com/b' },
  ] }
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run))
  const CL = join(dirname(SCRIPT), 'checklist.mjs')
  const go = (args) => new Promise((resolve, reject) => execFile('node', [CL, ...args], (err) => (err ? reject(err) : resolve())))
  await go(['--from', join(dir, 'run.json'), '--out', join(dir, 'v1')])
  const v1 = JSON.parse(readFileSync(join(dir, 'v1', 'checklist.json'), 'utf8'))
  assert.deepEqual(v1.sections.map((s) => s.id), ['p1', 'p2', 'p3', 'setup'])
  const alt = v1.sections[1].items[0]
  assert.equal(alt.id, 'finding.img.alt')
  assert.match(alt.where, /^2 pages: /)
  assert.ok(existsSync(join(dir, 'v1', 'checklist.html')))
  // tick one finding and one set-up step, then re-run with the P1 fixed
  v1.sections[1].items[0].done = true
  v1.sections[1].items[0].note = 'alt text added'
  v1.sections[3].items[0].done = true
  writeFileSync(join(dir, 'v1', 'checklist.json'), JSON.stringify(v1))
  writeFileSync(join(dir, 'run2.json'), JSON.stringify({ ...run, findings: run.findings.slice(1) }))
  await go(['--from', join(dir, 'run2.json'), '--out', join(dir, 'v2'), '--previous', join(dir, 'v1', 'checklist.json')])
  const v2 = JSON.parse(readFileSync(join(dir, 'v2', 'checklist.json'), 'utf8'))
  const all = v2.sections.flatMap((s) => s.items)
  assert.equal(all.find((i) => i.id === 'finding.img.alt').note, 'alt text added')
  assert.equal(all.find((i) => i.id === 'setup.gsc').done, true)
  const fixed = v2.sections.find((s) => s.id === 'fixed')
  assert.deepEqual(fixed.items.map((i) => [i.id, i.done]), [['finding.page.noindex-in-sitemap', true]])
})

test('--crawl counts inbound links, tells navigation from contextual links, flags weak ones', async () => {
  const nav = '<nav><a href="/">Home</a><a href="/a">Guides</a><a href="/b">Tools</a><a href="/c">About</a></nav>'
  const body = { '/': '', '/a': '<p><a href="/d">read more</a></p>', '/b': '<p><a href="/a">our tracing guides</a></p>', '/c': '', '/d': '<p><a href="/e">vector tracing tips</a></p>', '/e': '' }
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    if (!(path in body)) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html lang="en"><head><title>Page ${path} of the link fixture</title></head><body>${nav}<h1>Page ${path}</h1>${body[path]}</body></html>`)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  const out = join(mkdtempSync(join(tmpdir(), 'seo-links-')), 'r.json')
  await new Promise((resolve) => execFile('node', [SCRIPT, '--url', `http://localhost:${port}/`, '--render', 'off', '--delay', '0', '--max', '2', '--crawl', '20', '--json', out], () => resolve()))
  server.close()
  const r = JSON.parse(readFileSync(out, 'utf8'))
  const node = (path) => r.crawl.nodes.find((n) => new URL(n.url).pathname === path)
  assert.deepEqual(['/', '/a', '/b', '/c', '/d', '/e'].map((p) => node(p).navigation), [true, true, true, true, false, false])
  assert.equal(node('/a').inbound, 5, 'the five other pages link /a; /b linking it twice counts once')
  assert.deepEqual([node('/d').inbound, node('/d').anchors, node('/d').depth], [1, ['read more'], 2])
  assert.deepEqual(node('/e').anchors, ['vector tracing tips'])
  const few = r.findings.find((f) => f.id === 'links.few-inbound')
  assert.match(few.msg, /^2 page\(s\)/)
  assert.ok(r.findings.some((f) => f.id === 'links.generic-anchor' && /\/a → .*\/d/.test(f.msg)))
})

test('gsc.mjs finds striking distance, low CTR, cannibalisation, drops and pages at risk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-gsc-'))
  const S = 'https://example.com'
  const now = [
    'Query,Page,Clicks,Impressions,CTR,Position',
    `svg converter,${S}/tool,40,1000,4%,3.1`,
    `png to svg,${S}/tool,45,1000,4.5%,3.0`,
    `trace image,${S}/tool,42,1000,4.2%,3.2`,
    `"photo to svg, free",${S}/tool,5,1000,0.5%,2.9`,
    `vector tracing,${S}/blog/trace,3,800,0.4%,12.4`,
    `vector tracing,${S}/tool,2,400,0.5%,14.0`,
    `logo to svg,${S}/blog/logo,10,900,1.1%,6.0`,
    `tiny,${S}/tool,0,3,0%,40`,
  ].join('\n')
  const before = [
    'Query,Page,Clicks,Impressions,CTR,Position',
    `svg converter,${S}/tool,42,1000,4.2%,3.0`,
    `logo to svg,${S}/blog/logo,80,900,8.9%,2.5`,
    `png to svg,${S}/tool,60,1500,4%,3.0`,
  ].join('\n')
  writeFileSync(join(dir, 'now.csv'), now)
  writeFileSync(join(dir, 'before.csv'), before)
  writeFileSync(join(dir, 'seo.json'), JSON.stringify({ findings: [{ sev: 'P2', id: 'title.long', url: `${S}/tool` }, { sev: 'P3', id: 'img.alt', url: `${S}/blog/logo` }] }))
  const G = join(dirname(SCRIPT), 'gsc.mjs')
  const out = join(dir, 'g.json')
  await new Promise((resolve, reject) =>
    execFile('node', [G, '--rows', join(dir, 'now.csv'), '--previous', join(dir, 'before.csv'), '--checker', join(dir, 'seo.json'), '--json', out], (err) => (err ? reject(err) : resolve())),
  )
  const r = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(r.shape, { query: true, page: true, queryAndPage: true, rows: 8 })
  assert.equal(r.totals.clicks, 147)
  assert.deepEqual(r.striking.map((u) => u.query), ['vector tracing', 'vector tracing'])
  assert.deepEqual(r.lowCtr.map((u) => u.query), ['photo to svg, free'], 'judged against the site’s own CTR at position 3')
  assert.deepEqual(r.cannibal.map((c) => [c.query, c.pages.map((p) => new URL(p.page).pathname)]), [['vector tracing', ['/blog/trace', '/tool']]])
  assert.deepEqual(r.drops.map((d) => [d.query, d.why.split(':')[0]]), [['logo to svg', 'ranking'], ['png to svg', 'demand or coverage']])
  assert.deepEqual(r.atRisk.map((a) => [new URL(a.page).pathname, a.findings]), [['/tool', ['P2 title.long']]])

  // the UI export: queries and pages in separate files
  writeFileSync(join(dir, 'Queries.csv'), 'Top queries,Clicks,Impressions,CTR,Position\nsvg converter,40,1000,4%,9.5\n')
  writeFileSync(join(dir, 'Pages.csv'), `Top pages,Clicks,Impressions,CTR,Position\n${S}/tool,90,4000,2.25%,4\n`)
  await new Promise((resolve, reject) => execFile('node', [G, '--rows', join(dir, 'Queries.csv'), '--rows', join(dir, 'Pages.csv'), '--json', out], (err) => (err ? reject(err) : resolve())))
  const u = JSON.parse(readFileSync(out, 'utf8'))
  assert.equal(u.shape.queryAndPage, false)
  assert.deepEqual(u.striking.map((x) => x.query), ['svg converter'])
  assert.ok(u.skipped.some((s) => s.startsWith('cannibalisation')))
})
