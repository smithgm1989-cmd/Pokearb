/**
 * TCGPlayer Scraper
 * 
 * TCGPlayer (tcgplayer.com) is the largest Pokémon card marketplace.
 * Their "Market Price" is a rolling average of recent actual sales —
 * not listed prices. This is highly reliable for current market value.
 * 
 * We scrape:
 *   - Market price (avg of recent sales)
 *   - Listed prices (low / mid / high)
 *   - Seller count (proxy for supply)
 * 
 * Note: TCGPlayer's market price updates daily and reflects real transactions.
 */

const axios = require('axios')
const cheerio = require('cheerio')

const BASE = 'https://www.tcgplayer.com'

// TCGPlayer search for high-value graded Pokémon cards
// TCGPlayer primarily lists raw cards, but many graded cards are listed too
const SEARCH_TERMS = [
  'charizard psa 10',
  'charizard shadowless psa',
  'pikachu illustrator psa',
  'umbreon vmax alt art psa 10',
  'rayquaza vmax alt art psa 10',
  'gold star pokemon psa',
  'first edition charizard psa',
]

function parsePrice(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[^0-9.]/g, '')) || 0
}

/**
 * Search TCGPlayer for a card — returns market price data
 */
async function searchTCGPlayer(query) {
  const url = `${BASE}/search/pokemon/product?q=${encodeURIComponent(query)}&view=grid&inStock=true&Condition=Near+Mint`

  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.tcgplayer.com',
      },
      timeout: 12000,
    })

    const $ = cheerio.load(resp.data)
    const results = []

    // TCGPlayer product cards
    $('.search-result, .product-card').each((i, el) => {
      const nameEl = $(el).find('.product-card__title, .search-result__title, h3')
      const marketPriceEl = $(el).find('.product-card__market-price--value, .search-result__market-price, [data-automation="market-price"]')
      const listedPriceEl = $(el).find('.product-card__listed-median, .inventory__price-with-shipping')
      const linkEl = $(el).find('a').first()
      const sellerCountEl = $(el).find('.product-card__listing-count, .listings-count')

      const name = nameEl.text().trim()
      const marketPrice = parsePrice(marketPriceEl.text())
      const listedPrice = parsePrice(listedPriceEl.text())
      const href = linkEl.attr('href') || ''
      const sellerCount = parseInt(sellerCountEl.text().replace(/\D/g, '')) || 0

      if (!name || marketPrice < 100) return

      results.push({
        source: 'TCGPlayer',
        cardName: name,
        marketPrice, // This is the actual sales average
        listedPrice: listedPrice || marketPrice,
        sellerCount, // Low seller count = supply drying up
        url: href.startsWith('http') ? href : `${BASE}${href}`,
        currency: 'USD',
        query,
      })
    })

    return results
  } catch (err) {
    console.error(`[TCGPlayer] Search failed for "${query}":`, err.message)
    return []
  }
}

/**
 * Fetch TCGPlayer product page for detailed price history
 */
async function fetchTCGPlayerDetail(url) {
  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      timeout: 12000,
    })

    const $ = cheerio.load(resp.data)

    const low    = parsePrice($('[data-automation="listed-price-low"]').text() || $('.product-details__price--low').text())
    const mid    = parsePrice($('[data-automation="listed-price-mid"]').text() || $('.product-details__price--median').text())
    const high   = parsePrice($('[data-automation="listed-price-high"]').text() || $('.product-details__price--high').text())
    const market = parsePrice($('[data-automation="market-price"]').text() || $('.product-details__market-price').text())
    const sellers = parseInt($('.product-details__listing-count').text().replace(/\D/g, '')) || 0

    return { listedLow: low, listedMid: mid, listedHigh: high, marketPrice: market, activeSellers: sellers }
  } catch (err) {
    return { listedLow: 0, listedMid: 0, listedHigh: 0, marketPrice: 0, activeSellers: 0 }
  }
}

async function fetchTCGPlayerData() {
  console.log('[TCGPlayer] Starting scrape...')

  const allResults = []
  const seenNames = new Set()

  for (const query of SEARCH_TERMS) {
    const results = await searchTCGPlayer(query)
    console.log(`[TCGPlayer] "${query}" → ${results.length} results`)

    for (const r of results) {
      const key = r.cardName.toLowerCase()
      if (!seenNames.has(key)) {
        seenNames.add(key)
        allResults.push(r)
      }
    }

    await new Promise(resolve => setTimeout(resolve, 700))
  }

  console.log(`[TCGPlayer] Total: ${allResults.length}`)
  return allResults
}

module.exports = { fetchTCGPlayerData, fetchTCGPlayerDetail }
