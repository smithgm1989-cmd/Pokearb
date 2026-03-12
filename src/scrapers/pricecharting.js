/**
 * PriceCharting Scraper
 * 
 * PriceCharting (pricecharting.com) aggregates actual sold prices from
 * eBay completed listings and is the most reliable free source for
 * Pokémon card price history. It shows:
 *   - Ungraded, PSA 9, PSA 10 prices
 *   - Price history charts
 *   - Sales volume over time
 * 
 * This scraper pulls their search results and individual card pages.
 */

const axios = require('axios')
const cheerio = require('cheerio')

const BASE = 'https://www.pricecharting.com'

const HIGH_VALUE_SEARCHES = [
  'pokemon charizard psa 10',
  'pokemon psa 10 alt art',
  'pokemon psa 10 shadowless',
  'pokemon psa 10 first edition',
  'pokemon psa 10 gold star',
  'pokemon vintage psa 10',
]

function parsePrice(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[^0-9.]/g, '')) || 0
}

/**
 * Scrape PriceCharting search results page
 */
async function searchPriceCharting(query) {
  const url = `${BASE}/search-products?q=${encodeURIComponent(query)}&type=prices`

  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      timeout: 12000,
    })

    const $ = cheerio.load(resp.data)
    const results = []

    // PriceCharting search result rows
    $('#games-list tbody tr, .search-results tr').each((i, el) => {
      const nameEl = $(el).find('td.title a, td:first-child a')
      const priceEls = $(el).find('td.price, td.numeric')

      const name = nameEl.text().trim()
      const href = nameEl.attr('href') || ''
      const prices = []
      priceEls.each((_, p) => prices.push($(p).text().trim()))

      if (!name) return

      // PriceCharting columns: Ungraded | Grade 6 | Grade 7 | Grade 8 | Grade 9 | Grade 9.5 | Grade 10
      const psa9Price  = parsePrice(prices[4] || '0')
      const psa10Price = parsePrice(prices[6] || '0')

      // Only include cards where PSA 10 is over $1000 USD (~$1350 CAD)
      if (psa10Price < 750) return

      results.push({
        source: 'PriceCharting',
        cardName: name,
        url: href.startsWith('http') ? href : `${BASE}${href}`,
        psa9Price,
        psa10Price,
        ungradedPrice: parsePrice(prices[0] || '0'),
        currency: 'USD',
        query,
      })
    })

    return results
  } catch (err) {
    console.error(`[PriceCharting] Search failed for "${query}":`, err.message)
    return []
  }
}

/**
 * Fetch detailed price + volume data for a specific card page
 */
async function fetchCardDetail(url) {
  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      timeout: 12000,
    })

    const $ = cheerio.load(resp.data)

    // Grab the recent sales table
    const recentSales = []
    $('#sold-auction-prices tbody tr, .recent-sales tr').each((i, el) => {
      const cols = $(el).find('td')
      if (cols.length < 3) return
      const date  = $(cols[0]).text().trim()
      const grade = $(cols[1]).text().trim()
      const price = parsePrice($(cols[2]).text().trim())
      if (price > 0) recentSales.push({ date, grade, price })
    })

    // Sales volume indicator — count sales in last 30 days vs prior 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const sixtyDaysAgo  = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const last30  = recentSales.filter(s => new Date(s.date) > thirtyDaysAgo).length
    const prior30 = recentSales.filter(s => new Date(s.date) > sixtyDaysAgo && new Date(s.date) <= thirtyDaysAgo).length

    let volumeTrend = 'stable'
    if (prior30 > 0) {
      const changeRatio = (last30 - prior30) / prior30
      if (changeRatio > 0.25)       volumeTrend = 'increasing'
      else if (changeRatio < -0.25) volumeTrend = 'decreasing'
    } else if (last30 > 0) {
      volumeTrend = 'increasing'
    }

    // Price trend — compare avg of last 10 sales vs prior 10
    const avgRecent = recentSales.slice(0, 10).reduce((s, r) => s + r.price, 0) / Math.max(recentSales.slice(0, 10).length, 1)
    const avgPrior  = recentSales.slice(10, 20).reduce((s, r) => s + r.price, 0) / Math.max(recentSales.slice(10, 20).length, 1)

    let priceTrend = 'stable'
    if (avgPrior > 0) {
      const priceChange = (avgRecent - avgPrior) / avgPrior
      if (priceChange > 0.05)       priceTrend = 'rising'
      else if (priceChange < -0.05) priceTrend = 'falling'
    }

    return {
      recentSales: recentSales.slice(0, 20),
      volumeTrend,
      priceTrend,
      last30DaySales: last30,
      prior30DaySales: prior30,
    }
  } catch (err) {
    console.error(`[PriceCharting] Detail fetch failed for ${url}:`, err.message)
    return { recentSales: [], volumeTrend: 'unknown', priceTrend: 'unknown', last30DaySales: 0, prior30DaySales: 0 }
  }
}

/**
 * Main PriceCharting fetch
 */
async function fetchPriceChartingData() {
  console.log('[PriceCharting] Starting scrape...')

  const allResults = []
  const seenUrls = new Set()

  for (const query of HIGH_VALUE_SEARCHES) {
    const results = await searchPriceCharting(query)
    console.log(`[PriceCharting] "${query}" → ${results.length} cards`)

    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url)
        allResults.push(r)
      }
    }

    await new Promise(resolve => setTimeout(resolve, 600))
  }

  // Fetch detail pages for the top results (limit to avoid rate limiting)
  const topResults = allResults.slice(0, 20)
  for (const card of topResults) {
    if (card.url) {
      const detail = await fetchCardDetail(card.url)
      Object.assign(card, detail)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log(`[PriceCharting] Total cards: ${allResults.length}`)
  return allResults
}

module.exports = { fetchPriceChartingData, fetchCardDetail }
