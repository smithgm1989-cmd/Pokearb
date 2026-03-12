/**
 * Arbitrage Engine
 * 
 * Takes raw data from all scrapers and:
 *   1. Normalizes prices to CAD
 *   2. Groups listings by card (fuzzy match on card name + grade)
 *   3. Calculates buy/sell spread for every platform pair
 *   4. Scores deals by margin, volume trend, and confidence
 *   5. Returns sorted arbitrage opportunities
 */

// ── USD → CAD conversion ──
// In production, fetch this from an exchange rate API (exchangerate-api.com is free)
// Hardcoded fallback rate — update this or wire up live rates
const USD_TO_CAD_FALLBACK = 1.37

async function getUsdToCadRate() {
  try {
    const axios = require('axios')
    const resp = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 5000 })
    return resp.data?.rates?.CAD || USD_TO_CAD_FALLBACK
  } catch {
    return USD_TO_CAD_FALLBACK
  }
}

function toCad(price, currency, rate) {
  if (!price || price === 0) return 0
  if (currency === 'CAD') return price
  if (currency === 'USD') return Math.round(price * rate * 100) / 100
  if (currency === 'EUR') return Math.round(price * rate * 1.08 * 100) / 100 // EUR→USD→CAD
  return price
}

// ── PLATFORM FEE STRUCTURE ──
const PLATFORM_FEES = {
  eBay: {
    finalValueFee: 0.1325,  // 13.25% for most categories
    paymentProcessing: 0.03,
    shippingTypical: 15,    // CAD — domestic Canada shipping
    label: 'eBay.ca',
  },
  TCGPlayer: {
    finalValueFee: 0.1075,
    paymentProcessing: 0.03,
    shippingTypical: 8,
    label: 'TCGPlayer',
  },
  PriceCharting: {
    finalValueFee: 0,       // PriceCharting is reference only, not a marketplace
    paymentProcessing: 0,
    shippingTypical: 0,
    label: 'PriceCharting (ref)',
  },
  'Facebook Marketplace': {
    finalValueFee: 0,       // Local cash sales have no fees
    paymentProcessing: 0,
    shippingTypical: 0,     // Local pickup
    label: 'FB Marketplace (local)',
  },
}

/**
 * Calculate net profit after selling on a platform
 */
function calcNetProfit(buyPriceCad, sellPriceCad, sellPlatform) {
  const fees = PLATFORM_FEES[sellPlatform] || PLATFORM_FEES.eBay
  const platformCut = sellPriceCad * (fees.finalValueFee + fees.paymentProcessing)
  const shipping    = fees.shippingTypical
  const netProfit   = sellPriceCad - buyPriceCad - platformCut - shipping
  const roi         = buyPriceCad > 0 ? (netProfit / buyPriceCad) * 100 : 0
  return { netProfit, roi, platformCut, shipping }
}

/**
 * Normalize card name for fuzzy grouping
 * "Pokemon PSA 10 Charizard VMAX Alt Art" → "charizard vmax alt art psa 10"
 */
function normalizeCardKey(cardName, grade, company) {
  const clean = (cardName || '')
    .toLowerCase()
    .replace(/pokemon|pokémon/gi, '')
    .replace(/\b(the|a|an|of|in|for|and|or)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const gradeStr = grade ? `${company || ''} ${grade}`.toLowerCase().trim() : ''
  return [clean, gradeStr].filter(Boolean).join(' ')
}

/**
 * Determine volume trend signal
 */
function getVolumeSignal(last30, prior30) {
  if (last30 === 0 && prior30 === 0) return { label: 'No data', color: 'gray', icon: '—' }
  if (prior30 === 0 && last30 > 0)  return { label: 'New activity', color: 'blue', icon: '↗' }
  const ratio = (last30 - prior30) / prior30
  if (ratio > 0.5)  return { label: 'Volume surging', color: 'green', icon: '🔥' }
  if (ratio > 0.2)  return { label: 'Volume rising', color: 'green', icon: '↑' }
  if (ratio < -0.5) return { label: 'Supply drying up', color: 'orange', icon: '⚠' }
  if (ratio < -0.2) return { label: 'Volume slowing', color: 'yellow', icon: '↓' }
  return { label: 'Stable volume', color: 'gray', icon: '→' }
}

/**
 * Score an arbitrage opportunity 0–100
 * Weights: margin (50%), volume trend (20%), data confidence (30%)
 */
function scoreOpportunity(opportunity) {
  let score = 0

  // Margin score (up to 50 points)
  const roi = opportunity.roi || 0
  if (roi >= 30)      score += 50
  else if (roi >= 20) score += 40
  else if (roi >= 15) score += 30
  else if (roi >= 10) score += 20
  else if (roi >= 5)  score += 10

  // Volume trend (up to 20 points)
  const vol = opportunity.volumeTrend
  if (vol === 'increasing')  score += 20
  else if (vol === 'stable') score += 10
  else if (vol === 'decreasing') score += 5

  // Confidence — more data sources = more confident (up to 30 points)
  const sources = opportunity.sourceCount || 1
  score += Math.min(sources * 10, 30)

  return Math.min(score, 100)
}

/**
 * Main arbitrage calculation
 * Takes normalized data from all scrapers and finds cross-platform spreads
 */
async function calculateArbitrage({ ebayListings = [], priceChartingCards = [], tcgplayerCards = [], facebookListings = [] }) {
  const rate = await getUsdToCadRate()
  console.log(`[Arbitrage] Exchange rate: 1 USD = ${rate} CAD`)

  const opportunities = []

  // ── eBay as the primary SELL market (highest liquidity) ──
  // Strategy: find cheap buys on FB/local, TCGPlayer, then sell on eBay
  
  // Group eBay sold listings by card to get reliable sell prices
  const ebaySellPrices = {}
  for (const listing of ebayListings) {
    const key = normalizeCardKey(listing.cardName, listing.grade, listing.gradingCompany)
    if (!ebaySellPrices[key]) {
      ebaySellPrices[key] = {
        prices: [],
        listings: [],
        cardName: listing.cardName,
        grade: listing.grade,
        company: listing.gradingCompany,
      }
    }
    const priceCad = toCad(listing.price, listing.currency, rate)
    ebaySellPrices[key].prices.push(priceCad)
    ebaySellPrices[key].listings.push(listing)
  }

  // Calculate median eBay sell price per card (median is more robust than avg)
  const ebayMedians = {}
  for (const [key, data] of Object.entries(ebaySellPrices)) {
    const sorted = [...data.prices].sort((a, b) => a - b)
    const mid    = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    ebayMedians[key] = {
      medianSellPrice: median,
      saleCount: sorted.length,
      minPrice: sorted[0],
      maxPrice: sorted[sorted.length - 1],
      cardName: data.cardName,
      grade: data.grade,
      company: data.company,
      recentListings: data.listings.slice(0, 5),
    }
  }

  // ── PriceCharting as buy reference (they aggregate eBay sold too) ──
  for (const card of priceChartingCards) {
    const psa10CadBuy  = toCad(card.psa10Price,  'USD', rate)
    const psa9CadBuy   = toCad(card.psa9Price,   'USD', rate)

    if (psa10CadBuy < 1000 && psa9CadBuy < 1000) continue

    // Find matching eBay sell price
    const key = normalizeCardKey(card.cardName, '10', 'PSA')
    const ebayData = ebayMedians[key] || null

    const sellPriceCad = ebayData?.medianSellPrice || psa10CadBuy * 1.05 // 5% premium estimate if no eBay data
    const buyPriceCad  = psa10CadBuy

    if (buyPriceCad < 1000) continue

    const { netProfit, roi } = calcNetProfit(buyPriceCad, sellPriceCad, 'eBay')

    const volumeSignal = getVolumeSignal(card.last30DaySales || 0, card.prior30DaySales || 0)

    const opp = {
      id: `pc-${card.cardName.replace(/\s+/g, '-').toLowerCase()}`,
      cardName: card.cardName,
      grade: '10',
      gradingCompany: 'PSA',
      buyPlatform: 'PriceCharting',
      sellPlatform: 'eBay',
      buyPriceCad,
      sellPriceCad,
      netProfit,
      roi,
      volumeTrend: card.volumeTrend || 'unknown',
      priceTrend: card.priceTrend || 'unknown',
      volumeSignal,
      last30DaySales: card.last30DaySales || 0,
      prior30DaySales: card.prior30DaySales || 0,
      recentSales: card.recentSales || [],
      sourceCount: ebayData ? 2 : 1,
      sourceUrls: { buy: card.url, sell: 'https://www.ebay.ca' },
      currency: 'CAD',
      exchangeRate: rate,
    }

    opp.score = scoreOpportunity(opp)
    opportunities.push(opp)
  }

  // ── Facebook Marketplace as buy source (local Calgary deals) ──
  for (const fbListing of facebookListings) {
    const buyPriceCad = toCad(fbListing.price, fbListing.currency || 'CAD', rate)
    if (buyPriceCad < 1000) continue

    const key = normalizeCardKey(fbListing.cardName, fbListing.grade, fbListing.gradingCompany)
    const ebayData = ebayMedians[key] || null

    if (!ebayData) continue // Skip if we can't find an eBay comp

    const sellPriceCad = ebayData.medianSellPrice
    const { netProfit, roi } = calcNetProfit(buyPriceCad, sellPriceCad, 'eBay')

    const opp = {
      id: `fb-${fbListing.cardName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
      cardName: fbListing.cardName,
      grade: fbListing.grade,
      gradingCompany: fbListing.gradingCompany,
      buyPlatform: 'Facebook Marketplace',
      sellPlatform: 'eBay',
      buyPriceCad,
      sellPriceCad,
      netProfit,
      roi,
      volumeTrend: 'local',
      volumeSignal: { label: 'Local deal', color: 'blue', icon: '📍' },
      last30DaySales: ebayData.saleCount,
      sourceCount: 2,
      sourceUrls: { buy: fbListing.url, sell: 'https://www.ebay.ca' },
      isLocal: true,
      location: fbListing.location,
      currency: 'CAD',
      exchangeRate: rate,
    }

    opp.score = scoreOpportunity(opp) + 15 // Bonus: local = no shipping risk
    opportunities.push(opp)
  }

  // ── Sort by score descending, then net profit ──
  opportunities.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.netProfit - a.netProfit
  })

  // Filter: only show deals where ROI > 5% (otherwise not worth it)
  const profitable = opportunities.filter(o => o.roi > 5 && o.buyPriceCad >= 1000)

  return {
    opportunities: profitable,
    totalScanned: ebayListings.length + priceChartingCards.length + tcgplayerCards.length + facebookListings.length,
    exchangeRate: rate,
    generatedAt: new Date().toISOString(),
  }
}

module.exports = { calculateArbitrage, getUsdToCadRate, calcNetProfit, PLATFORM_FEES }
