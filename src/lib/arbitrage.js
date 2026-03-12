/**
 * Arbitrage Engine
 * 
 * Logic: PriceCharting gives us the "market consensus" price for PSA 10 cards.
 * The arbitrage opportunity is:
 *   BUY:  a graded card at or below market price (local deal, motivated seller, etc.)
 *   SELL: on eBay where graded cards command a premium over raw/reference prices
 * 
 * We model three tiers per card:
 *   - "Good deal" buy: 85% of market price (realistic motivated seller discount)
 *   - Market buy: 100% of market price
 *   - eBay sell: market price + graded premium (typically 15-25% above reference)
 */

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
  return price
}

const PLATFORM_FEES = {
  'eBay': {
    finalValueFee: 0.1325,
    paymentProcessing: 0.03,
    shippingTypical: 15,
  },
  'TCGPlayer': {
    finalValueFee: 0.1075,
    paymentProcessing: 0.03,
    shippingTypical: 8,
  },
  'Facebook Marketplace': {
    finalValueFee: 0,
    paymentProcessing: 0,
    shippingTypical: 0,
  },
}

function calcNetProfit(buyPriceCad, sellPriceCad, sellPlatform) {
  const fees = PLATFORM_FEES[sellPlatform] || PLATFORM_FEES['eBay']
  const platformCut = sellPriceCad * (fees.finalValueFee + fees.paymentProcessing)
  const shipping    = fees.shippingTypical
  const netProfit   = sellPriceCad - buyPriceCad - platformCut - shipping
  const roi         = buyPriceCad > 0 ? (netProfit / buyPriceCad) * 100 : 0
  return { netProfit: Math.round(netProfit), roi: Math.round(roi * 10) / 10, platformCut: Math.round(platformCut), shipping }
}

function getVolumeSignal(last30, prior30) {
  if (!last30 && !prior30) return { label: 'No data', color: 'gray', icon: '—' }
  if (!prior30 && last30 > 0) return { label: 'New activity', color: 'blue', icon: '↗' }
  const ratio = (last30 - prior30) / prior30
  if (ratio > 0.5)  return { label: 'Volume surging',   color: 'green',  icon: '🔥' }
  if (ratio > 0.2)  return { label: 'Volume rising',    color: 'green',  icon: '↑'  }
  if (ratio < -0.5) return { label: 'Supply drying up', color: 'orange', icon: '⚠'  }
  if (ratio < -0.2) return { label: 'Volume slowing',   color: 'yellow', icon: '↓'  }
  return { label: 'Stable volume', color: 'gray', icon: '→' }
}

function scoreOpportunity(opp) {
  let score = 0
  const roi = opp.roi || 0
  if (roi >= 30)      score += 50
  else if (roi >= 20) score += 40
  else if (roi >= 15) score += 30
  else if (roi >= 10) score += 20
  else if (roi >= 5)  score += 10

  const vol = opp.volumeTrend
  if (vol === 'increasing')  score += 20
  else if (vol === 'stable') score += 10
  else if (vol === 'decreasing') score += 5

  score += Math.min((opp.sourceCount || 1) * 10, 30)
  return Math.min(score, 100)
}

async function calculateArbitrage({ ebayListings = [], priceChartingCards = [], tcgplayerCards = [], facebookListings = [] }) {
  const rate = await getUsdToCadRate()
  console.log(`[Arbitrage] Exchange rate: 1 USD = ${rate} CAD`)
  console.log(`[Arbitrage] Inputs: ${ebayListings.length} eBay, ${priceChartingCards.length} PC, ${tcgplayerCards.length} TCG, ${facebookListings.length} FB`)

  const opportunities = []

  // ── PRIMARY: PriceCharting cards → model buy low / sell on eBay ──
  // For each card, we show THREE scenarios:
  //   1. "Market deal" — buy at market, sell on eBay at graded premium
  //   2. "Good deal"   — buy at 85% of market (motivated seller)
  //   3. "Steal"       — buy at 70% of market (below market local deal)

  for (const card of priceChartingCards) {
    const marketPriceCad = toCad(card.psa10Price, 'USD', rate)
    if (marketPriceCad < 1000) continue

    // eBay graded cards typically sell 15-25% above PriceCharting reference
    // PriceCharting aggregates ALL sales; eBay auction format skews higher
    const ebayPremium = card.cardName.includes('1st Edition') || card.cardName.includes('Shadowless') ? 1.20 : 1.15
    const ebaySellPrice = marketPriceCad * ebayPremium

    const scenarios = [
      { label: 'Market Price Buy',  buyMultiplier: 1.00, suffix: '' },
      { label: 'Good Deal Buy',     buyMultiplier: 0.85, suffix: '-good' },
      { label: 'Below Market Buy',  buyMultiplier: 0.70, suffix: '-steal' },
    ]

    for (const scenario of scenarios) {
      const buyPriceCad  = Math.round(marketPriceCad * scenario.buyMultiplier)
      const sellPriceCad = Math.round(ebaySellPrice)

      const { netProfit, roi, platformCut, shipping } = calcNetProfit(buyPriceCad, sellPriceCad, 'eBay')

      // Only include if profitable
      if (roi < 5) continue

      const volumeSignal = getVolumeSignal(card.last30DaySales, card.prior30DaySales)

      const opp = {
        id: `pc-${card.cardName.replace(/\s+/g, '-').toLowerCase()}${scenario.suffix}`,
        cardName: card.cardName,
        grade: '10',
        gradingCompany: 'PSA',
        buyScenario: scenario.label,
        buyPlatform: scenario.buyMultiplier < 1 ? 'Local / Below Market' : 'PriceCharting (Market)',
        sellPlatform: 'eBay',
        buyPriceCad,
        sellPriceCad,
        marketPriceCad,
        netProfit,
        roi,
        platformCut,
        shipping,
        volumeTrend: card.volumeTrend || 'stable',
        priceTrend: card.priceTrend || 'stable',
        volumeSignal,
        last30DaySales: card.last30DaySales || 0,
        prior30DaySales: card.prior30DaySales || 0,
        recentSales: card.recentSales || [],
        sourceCount: 2,
        sourceUrls: {
          buy: card.url,
          sell: `https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(card.cardName + ' PSA 10')}&LH_Sold=1&LH_Complete=1`,
        },
        currency: 'CAD',
        exchangeRate: rate,
      }

      opp.score = scoreOpportunity(opp)
      opportunities.push(opp)
    }
  }

  // ── FACEBOOK MARKETPLACE local deals ──
  for (const fbListing of facebookListings) {
    const buyPriceCad = toCad(fbListing.price, fbListing.currency || 'CAD', rate)
    if (buyPriceCad < 1000) continue

    // Find a matching PriceCharting card for sell price reference
    const matchingCard = priceChartingCards.find(c =>
      c.cardName.toLowerCase().includes(fbListing.cardName?.toLowerCase()?.split(' ')[0] || '')
    )

    const sellPriceCad = matchingCard
      ? Math.round(toCad(matchingCard.psa10Price, 'USD', rate) * 1.15)
      : Math.round(buyPriceCad * 1.20)

    const { netProfit, roi } = calcNetProfit(buyPriceCad, sellPriceCad, 'eBay')

    const opp = {
      id: `fb-${Date.now()}-${Math.random()}`,
      cardName: fbListing.cardName,
      grade: fbListing.grade,
      gradingCompany: fbListing.gradingCompany,
      buyScenario: 'Local Deal',
      buyPlatform: 'Facebook Marketplace',
      sellPlatform: 'eBay',
      buyPriceCad,
      sellPriceCad,
      netProfit,
      roi,
      volumeTrend: 'local',
      volumeSignal: { label: 'Local Calgary deal', color: 'blue', icon: '📍' },
      last30DaySales: matchingCard?.last30DaySales || 0,
      prior30DaySales: matchingCard?.prior30DaySales || 0,
      sourceCount: 2,
      sourceUrls: { buy: fbListing.url, sell: 'https://www.ebay.ca' },
      isLocal: true,
      location: fbListing.location || 'Calgary, AB',
      currency: 'CAD',
      exchangeRate: rate,
    }

    opp.score = scoreOpportunity(opp) + 15
    opportunities.push(opp)
  }

  // Sort by score then profit
  opportunities.sort((a, b) => b.score !== a.score ? b.score - a.score : b.netProfit - a.netProfit)

  // Show all profitable opportunities (ROI > 5%)
  const profitable = opportunities.filter(o => o.roi > 5 && o.buyPriceCad >= 1000)

  console.log(`[Arbitrage] Generated ${opportunities.length} opps, ${profitable.length} profitable`)

  return {
    opportunities: profitable,
    totalScanned: ebayListings.length + priceChartingCards.length + tcgplayerCards.length + facebookListings.length,
    exchangeRate: rate,
    generatedAt: new Date().toISOString(),
  }
}

module.exports = { calculateArbitrage, getUsdToCadRate, calcNetProfit, PLATFORM_FEES }
