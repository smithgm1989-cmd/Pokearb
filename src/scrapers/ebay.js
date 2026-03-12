/**
 * eBay Sold Listings Scraper
 * 
 * Uses eBay's public completed/sold listings search — the same data
 * a buyer sees when they filter "Sold Items" on eBay.ca.
 * 
 * No API key needed for this approach. For higher rate limits and
 * richer data, swap to the eBay Marketplace Insights API once you
 * have production credentials.
 * 
 * Targets: Graded Pokémon cards (PSA/BGS/CGC) sold > $1000 CAD
 */

const axios = require('axios')
const cheerio = require('cheerio')

const EBAY_CA_BASE = 'https://www.ebay.ca'
const MIN_PRICE_CAD = 1000

// eBay category IDs
// 183454 = Pokémon Individual Cards
// 2536   = Non-Sport Trading Cards (broader)
const CATEGORY_ID = '183454'

// Search queries that reliably surface high-value graded cards
const SEARCH_QUERIES = [
  'Pokemon PSA 10 charizard',
  'Pokemon PSA 10 pikachu',
  'Pokemon PSA 9 charizard vintage',
  'Pokemon BGS 9.5 alt art',
  'Pokemon PSA 10 shadowless',
  'Pokemon PSA 10 first edition',
  'Pokemon CGC 10 alt art',
  'Pokemon PSA 10 umbreon vmax',
  'Pokemon PSA 10 rayquaza',
  'Pokemon BGS 10 charizard',
]

/**
 * Parse a price string like "C $1,234.56" or "$1,234.56" → number in CAD
 */
function parsePrice(str) {
  if (!str) return 0
  // Remove currency symbols, "C", spaces, commas
  const clean = str.replace(/[^0-9.]/g, '')
  return parseFloat(clean) || 0
}

/**
 * Parse a date string from eBay sold listings
 */
function parseDate(str) {
  if (!str) return new Date()
  try {
    return new Date(str)
  } catch {
    return new Date()
  }
}

/**
 * Determine grading company and grade from title
 */
function extractGradeInfo(title) {
  const upper = title.toUpperCase()

  let company = null
  let grade = null

  if (upper.includes('PSA')) {
    company = 'PSA'
    const match = title.match(/PSA\s*(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)/i)
    grade = match ? match[1] : null
  } else if (upper.includes('BGS') || upper.includes('BECKETT')) {
    company = 'BGS'
    const match = title.match(/BGS\s*(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)/i)
    grade = match ? match[1] : null
  } else if (upper.includes('CGC')) {
    company = 'CGC'
    const match = title.match(/CGC\s*(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)/i)
    grade = match ? match[1] : null
  } else if (upper.includes('ACE')) {
    company = 'ACE'
    const match = title.match(/ACE\s*(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)/i)
    grade = match ? match[1] : null
  }

  return { company, grade }
}

/**
 * Extract card name from a graded card listing title
 * Strips out grader info, set names, filler words
 */
function extractCardName(title) {
  let clean = title
    .replace(/PSA|BGS|CGC|ACE|BECKETT/gi, '')
    .replace(/\b(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)\b/g, '')
    .replace(/\b(GRADED|SLAB|GEM|MINT|NM|NEAR|CARD|POKEMON|POKÉMON|TCG|SEALED|PACK|BOX)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean
}

/**
 * Scrape eBay completed/sold listings for a single search query
 */
async function scrapeEbaySold(query) {
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: '1',        // Sold listings only
    LH_Complete: '1',    // Completed listings
    _sop: '13',          // Sort: recently ended
    _udlo: MIN_PRICE_CAD, // Min price
    Category_Type: 'All',
    _sacat: CATEGORY_ID,
    LH_ItemCondition: '3000', // Used (graded cards are "used")
    _pgn: '1',
    ipg: '60',           // 60 results per page
    _dmd: '1',
  })

  const url = `${EBAY_CA_BASE}/sch/i.html?${params}`

  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-CA,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    })

    const $ = cheerio.load(resp.data)
    const results = []

    $('.s-item').each((i, el) => {
      // Skip the first ghost element eBay always inserts
      if (i === 0) return

      const titleEl = $(el).find('.s-item__title')
      const priceEl = $(el).find('.s-item__price')
      const soldDateEl = $(el).find('.s-item__ended-date, .s-item__listingDate')
      const linkEl = $(el).find('.s-item__link')
      const imageEl = $(el).find('.s-item__image-img')

      const title = titleEl.text().trim()
      const priceText = priceEl.text().trim()
      const dateText = soldDateEl.text().trim()
      const link = linkEl.attr('href') || ''
      const image = imageEl.attr('src') || imageEl.attr('data-src') || ''

      if (!title || title === 'Shop on eBay') return

      const price = parsePrice(priceText)

      // Only include graded cards over our minimum
      if (price < MIN_PRICE_CAD) return

      const { company, grade } = extractGradeInfo(title)

      // Skip ungraded cards (we want slabs only)
      if (!company) return

      const cardName = extractCardName(title)

      results.push({
        source: 'eBay',
        title: title.slice(0, 120),
        cardName,
        price,
        currency: 'CAD',
        gradingCompany: company,
        grade,
        soldDate: dateText,
        url: link.split('?')[0], // Clean URL
        image,
        query,
      })
    })

    return results
  } catch (err) {
    console.error(`eBay scrape failed for "${query}":`, err.message)
    return []
  }
}

/**
 * Main eBay data fetch — runs all queries, deduplicates by URL
 */
async function fetchEbaySoldListings() {
  console.log('[eBay] Starting sold listings scrape...')

  const allResults = []
  const seenUrls = new Set()

  // Stagger requests to be polite
  for (const query of SEARCH_QUERIES) {
    const results = await scrapeEbaySold(query)
    console.log(`[eBay] "${query}" → ${results.length} results`)

    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url)
        allResults.push(r)
      }
    }

    // 800ms delay between requests
    await new Promise(resolve => setTimeout(resolve, 800))
  }

  console.log(`[eBay] Total unique sold listings: ${allResults.length}`)
  return allResults
}

module.exports = { fetchEbaySoldListings }
