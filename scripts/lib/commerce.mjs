// commerce.mjs: checks for shops and local businesses on parsed JSON-LD, per
// Google's product snippet / merchant listing and local business documentation.
// Pure functions: the checker passes the nodes and reports what comes back.

const LOCAL_TYPES = /^(LocalBusiness|Store|OnlineStore|Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery|Winery|Brewery|Distillery|LodgingBusiness|Hotel|ProfessionalService|LegalService|Attorney|Dentist|Physician|MedicalBusiness|MedicalClinic|HealthAndBeautyBusiness|HairSalon|DaySpa|AutomotiveBusiness|AutoRepair|HomeAndConstructionBusiness|Plumber|Electrician|RealEstateAgent|FinancialService|SportsActivityLocation|EntertainmentBusiness|ChildCare)$/

const typesOf = (n) => [].concat(n?.['@type'] || []).map(String)
const has = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length)

// Every object node in a parsed JSON-LD document (follows @graph and nesting).
export function nodes(data) {
  const out = []
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (n && typeof n === 'object') {
      if (n['@type']) out.push(n)
      Object.values(n).forEach(walk)
    }
  }
  walk(data)
  return out
}

// Problems on one page's JSON-LD nodes: [{ sev, id, msg }]
export function commerceFindings(all) {
  const out = []
  const add = (sev, id, msg) => out.push({ sev, id, msg })
  for (const p of all.filter((n) => typesOf(n).some((t) => t === 'Product' || t === 'ProductGroup'))) {
    const name = p.name ? `"${String(p.name).slice(0, 50)}"` : 'A Product'
    if (!has(p.name)) add('P2', 'schema.product-incomplete', 'Product markup has no name, which Google requires.')
    if (!has(p.offers) && !has(p.review) && !has(p.aggregateRating) && !typesOf(p).includes('ProductGroup'))
      add('P2', 'schema.product-incomplete', `${name} has no offers, review or aggregateRating, so it can't show as a product rich result.`)
    for (const o of [].concat(p.offers || [])) {
      if (!o || typeof o !== 'object') continue
      const spec = o.priceSpecification && [].concat(o.priceSpecification)[0]
      const price = has(o.price) || has(o.lowPrice) || has(spec?.price)
      const currency = has(o.priceCurrency) || has(spec?.priceCurrency)
      if (!price || !currency) add('P2', 'schema.product-offer', `${name}'s offer is missing ${[!price && 'price', !currency && 'priceCurrency'].filter(Boolean).join(' and ')}: merchant listings need both.`)
      if (!has(o.availability) && !typesOf(o).includes('AggregateOffer')) add('P3', 'schema.product-availability', `${name}'s offer has no availability (InStock, OutOfStock …); Google recommends it and shows it in results.`)
    }
  }
  for (const b of all.filter((n) => typesOf(n).some((t) => LOCAL_TYPES.test(t)))) {
    const missing = ['name', 'address'].filter((k) => !has(b[k]))
    const recommended = ['telephone', 'url', 'openingHoursSpecification'].filter((k) => !has(b[k]) && !(k === 'openingHoursSpecification' && has(b.openingHours)))
    if (missing.length) add('P2', 'schema.local-incomplete', `${typesOf(b)[0]} markup is missing ${missing.join(' and ')}, which Google requires for local business results.`)
    else if (recommended.length) add('P3', 'schema.local-recommended', `${typesOf(b)[0]} markup has no ${recommended.join(', ')}; Google recommends them.`)
  }
  return out
}

// Phone numbers from tel: links and LocalBusiness telephone, digits only.
export function phones(links, all) {
  const out = new Set()
  const norm = (t) => String(t).replace(/^tel:/i, '').replace(/[^\d+]/g, '').replace(/^\+?1(?=\d{10}$)/, '')
  for (const l of links) if (/^tel:/i.test(l.href || '')) out.add(norm(l.href))
  for (const b of all) if (has(b.telephone) && typesOf(b).some((t) => LOCAL_TYPES.test(t) || t === 'Organization')) out.add(norm(b.telephone))
  return [...out].filter((x) => x.replace('+', '').length >= 7)
}
