/**
 * /api/ebay
 * Fetches recently sold + active graded Pokémon card listings from eBay
 * using the Browse API. Filters to graded cards (PSA/BGS/CGC/ACE) over
 * the user's minimum CAD threshold.
 *
 * eBay returns prices in USD. We convert to CAD using a live rate.
 * Requires: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET in .env.local
 *
 * Setup:
 *  1. Go to https://developer.ebay.com
 *  2. Create a Production app keyset
 *  3. Copy App ID → EBAY_CLIENT_ID, Cert ID → EBAY_CLIENT_SECRET
 */

const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'

// Simple in-memory token cache
let tokenCache = null
let tokenExpiry = 0

async function getEbayToken() {
  if (tokenCache && Date.now() < tokenExpiry) return tokenCache

  const creds = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`eBay auth failed: ${err}`)
  }

  const data = await res.json()
  tokenCache = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return tokenCache
}

async function getUsdToCadRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    const data = await res.json()
    return data.rates?.CAD || 1.36
  } catch {
    return 1.36 // fallback rate
  }
}

function parseGrader(title) {
  const t = title.toUpperCase()
  if (t.includes('PSA 10')) return { grader: 'PSA', grade: '10' }
  if (t.includes('PSA 9'))  return { grader: 'PSA', grade: '9' }
  if (t.includes('PSA 8'))  return { grader: 'PSA', grade: '8' }
  if (t.includes('BGS 10') || t.includes('BCCG 10')) return { grader: 'BGS', grade: '10' }
  if (t.includes('BGS 9.5')) return { grader: 'BGS', grade: '9.5' }
  if (t.includes('BGS 9'))   return { grader: 'BGS', grade: '9' }
  if (t.includes('CGC 10'))  return { grader: 'CGC', grade: '10' }
  if (t.includes('CGC 9.5')) return { grader: 'CGC', grade: '9.5' }
  if (t.includes('CGC 9'))   return { grader: 'CGC', grade: '9' }
  if (t.includes('ACE 10'))  return { grader: 'ACE', grade: '10' }
  if (t.includes('ACE 9'))   return { grader: 'ACE', grade: '9' }
  return null
}

function getCardEmoji(title) {
  const t = title.toUpperCase()
  if (t.includes('CHARIZARD')) return '🔥'
  if (t.includes('PIKACHU'))   return '⚡'
  if (t.includes('UMBREON'))   return '🌙'
  if (t.includes('RAYQUAZA'))  return '🐉'
  if (t.includes('LUGIA'))     return '🌊'
  if (t.includes('MEWTWO'))    return '🔮'
  if (t.includes('EEVEE'))     return '🦊'
  if (t.includes('GENGAR'))    return '👻'
  if (t.includes('SNORLAX'))   return '💤'
  return '✨'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const minCad = parseFloat(req.query.minCad) || 1000
  const graders = req.query.graders ? req.query.graders.split(',') : ['PSA', 'BGS', 'CGC', 'ACE']
  const search  = req.query.search || ''

  // Check for API credentials
  if (!process.env.EBAY_CLIENT_ID || process.env.EBAY_CLIENT_ID === 'your_ebay_client_id') {
    // Return demo data when no real credentials are set
    return res.status(200).json({ items: getDemoData(minCad), demo: true, cadRate: 1.36 })
  }

  try {
    const [token, cadRate] = await Promise.all([getEbayToken(), getUsdToCadRate()])

    // Build grader query — search for graded cards specifically
    const graderTerms = graders.map(g => `"${g}"`).join(' OR ')
    const baseQuery = search
      ? `${search} pokemon (${graderTerms})`
      : `pokemon card graded (${graderTerms})`

    // Convert CAD min to USD for eBay filter
    const minUsd = Math.floor(minCad / cadRate)

    const params = new URLSearchParams({
      q: baseQuery,
      category_ids: '183454', // Pokémon Individual Cards
      filter: `price:[${minUsd}..],priceCurrency:USD,conditions:{USED},buyingOptions:{FIXED_PRICE}`,
      sort: 'price',
      limit: '50',
      fieldgroups: 'EXTENDED',
    })

    const ebayRes = await fetch(`${EBAY_BROWSE_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
    })

    if (!ebayRes.ok) {
      const err = await ebayRes.text()
      throw new Error(`eBay Browse API error: ${err}`)
    }

    const data = await ebayRes.json()
    const rawItems = data.itemSummaries || []

    // Filter, parse, and enrich items
    const items = rawItems
      .map(item => {
        const gradeInfo = parseGrader(item.title)
        if (!gradeInfo) return null

        const priceUsd = parseFloat(item.price?.value || 0)
        const priceCad = Math.round(priceUsd * cadRate)

        if (priceCad < minCad) return null
        if (!graders.includes(gradeInfo.grader)) return null

        return {
          id: item.itemId,
          title: item.title,
          emoji: getCardEmoji(item.title),
          grader: gradeInfo.grader,
          grade: gradeInfo.grade,
          priceUsd,
          priceCad,
          cadRate,
          url: item.itemWebUrl,
          image: item.image?.imageUrl || null,
          condition: item.condition,
          seller: item.seller?.username || 'unknown',
          platform: 'eBay',
          platformColor: 'plat-ebay',
          // Spread vs estimated buy price (raw card value ~60-70% of graded)
          estimatedRawCad: Math.round(priceCad * 0.65),
          spreadPct: 35, // eBay graded typically 30-40% over raw
          netProfitCad: Math.round(priceCad * 0.30 - 35), // rough est after fees
        }
      })
      .filter(Boolean)
      .slice(0, 30)

    return res.status(200).json({ items, demo: false, cadRate })
  } catch (err) {
    console.error('eBay API error:', err.message)
    // Fall back to demo data on error so the UI still works
    return res.status(200).json({ items: getDemoData(minCad), demo: true, cadRate: 1.36, error: err.message })
  }
}

function getDemoData(minCad) {
  const allItems = [
    {
      id: 'demo-1', title: 'Charizard VMAX Alt Art PSA 10 Gem Mint Evolving Skies',
      emoji: '🔥', grader: 'PSA', grade: '10',
      priceUsd: 850, priceCad: 1156, cadRate: 1.36,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=charizard+vmax+psa+10',
      platform: 'eBay', platformColor: 'plat-ebay',
      estimatedRawCad: 752, spreadPct: 42, netProfitCad: 289,
    },
    {
      id: 'demo-2', title: 'Umbreon VMAX Alt Art PSA 10 Gem Mint Evolving Skies 215',
      emoji: '🌙', grader: 'PSA', grade: '10',
      priceUsd: 740, priceCad: 1006, cadRate: 1.36,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=umbreon+vmax+psa+10',
      platform: 'eBay', platformColor: 'plat-ebay',
      estimatedRawCad: 654, spreadPct: 38, netProfitCad: 218,
    },
    {
      id: 'demo-3', title: 'Charizard Base Set Shadowless BGS 9.5 Gem Mint 1999',
      emoji: '🔥', grader: 'BGS', grade: '9.5',
      priceUsd: 2200, priceCad: 2992, cadRate: 1.36,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=charizard+base+set+bgs+9.5',
      platform: 'eBay', platformColor: 'plat-ebay',
      estimatedRawCad: 1945, spreadPct: 29, netProfitCad: 612,
    },
    {
      id: 'demo-4', title: 'Rayquaza VMAX Alt Art PSA 10 Evolving Skies 203',
      emoji: '🐉', grader: 'PSA', grade: '10',
      priceUsd: 540, priceCad: 1462, cadRate: 1.36, // FB inflated
      url: 'https://www.facebook.com/marketplace',
      platform: 'Facebook Marketplace', platformColor: 'plat-fb',
      localDistance: '12 km · Calgary',
      estimatedRawCad: 952, spreadPct: 53, netProfitCad: 374,
    },
    {
      id: 'demo-5', title: 'Pikachu Illustrator CGC 9 Near Mint/Mint 1998',
      emoji: '⚡', grader: 'CGC', grade: '9',
      priceUsd: 3100, priceCad: 4216, cadRate: 1.36,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=pikachu+illustrator+cgc',
      platform: 'eBay', platformColor: 'plat-ebay',
      estimatedRawCad: 2740, spreadPct: 35, netProfitCad: 1048,
    },
    {
      id: 'demo-6', title: 'Mewtwo Base Set Holo PSA 10 Gem Mint 1999',
      emoji: '🔮', grader: 'PSA', grade: '10',
      priceUsd: 890, priceCad: 1210, cadRate: 1.36,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=mewtwo+base+set+psa+10',
      platform: 'TCGPlayer', platformColor: 'plat-tcg',
      estimatedRawCad: 787, spreadPct: 21, netProfitCad: 178,
    },
    {
      id: 'demo-7', title: 'Lugia V Alt Art PSA 10 Silver Tempest 186',
      emoji: '🌊', grader: 'PSA', grade: '10',
      priceUsd: 620, priceCad: 1400, cadRate: 1.36,
      url: 'https://www.facebook.com/marketplace',
      platform: 'Facebook Marketplace', platformColor: 'plat-fb',
      localDistance: '8 km · Calgary NW',
      estimatedRawCad: 910, spreadPct: 47, netProfitCad: 322,
    },
    {
      id: 'demo-8', title: 'Charizard 1st Edition Base Set PSA 8 NM-MT 1999',
      emoji: '🔥', grader: 'PSA', grade: '8',
      priceUsd: 3800, priceCad: 5168, cadRate: 1.36,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=charizard+1st+edition+psa+8',
      platform: 'CardMarket', platformColor: 'plat-cm',
      estimatedRawCad: 3359, spreadPct: 44, netProfitCad: 1287,
    },
  ]

  return allItems.filter(i => i.priceCad >= minCad)
}
