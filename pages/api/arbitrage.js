/**
 * GET  /api/arbitrage        — fetch opportunities (cached)
 * POST /api/arbitrage        — add a Facebook Marketplace listing manually
 * DELETE /api/arbitrage?id=  — remove a Facebook listing
 */

import { fetchEbaySoldListings }   from '../../src/scrapers/ebay'
import { fetchPriceChartingData }  from '../../src/scrapers/pricecharting'
import { fetchTCGPlayerData }      from '../../src/scrapers/tcgplayer'
import { getFacebookListings, validateFBEntry } from '../../src/scrapers/facebook'
import { calculateArbitrage }      from '../../src/lib/arbitrage'
import * as cache                  from '../../src/lib/cache'

// In-memory store for manually added FB listings
// In production: replace with Supabase or a JSON file
const fbListingsStore = []

export default async function handler(req, res) {

  // ── ADD FACEBOOK LISTING ──
  if (req.method === 'POST') {
    const entry = req.body
    const errors = validateFBEntry(entry)
    if (errors.length > 0) {
      return res.status(400).json({ errors })
    }
    const newEntry = {
      ...entry,
      id: `fb-${Date.now()}`,
      enteredAt: new Date().toISOString(),
    }
    fbListingsStore.push(newEntry)
    // Bust cache so next GET picks up the new listing
    cache.del('arbitrage-results')
    return res.status(201).json({ ok: true, entry: newEntry })
  }

  // ── REMOVE FACEBOOK LISTING ──
  if (req.method === 'DELETE') {
    const { id } = req.query
    const idx = fbListingsStore.findIndex(e => e.id === id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    fbListingsStore.splice(idx, 1)
    cache.del('arbitrage-results')
    return res.status(200).json({ ok: true })
  }

  // ── GET OPPORTUNITIES ──
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const forceRefresh = req.query.refresh === '1'

  // Return cached result if available
  if (!forceRefresh) {
    const cached = cache.get('arbitrage-results')
    if (cached) {
      console.log('[API] Returning cached arbitrage data')
      return res.status(200).json({ ...cached, fromCache: true })
    }
  }

  console.log('[API] Fetching fresh data from all sources...')
  const startTime = Date.now()

  try {
    // Run scrapers in parallel where possible
    // PriceCharting and TCGPlayer can run together; eBay is the heaviest
    const [ebayListings, priceChartingCards, tcgplayerCards] = await Promise.all([
      fetchEbaySoldListings().catch(err => {
        console.error('[API] eBay scraper failed:', err.message)
        return []
      }),
      fetchPriceChartingData().catch(err => {
        console.error('[API] PriceCharting scraper failed:', err.message)
        return []
      }),
      fetchTCGPlayerData().catch(err => {
        console.error('[API] TCGPlayer scraper failed:', err.message)
        return []
      }),
    ])

    const facebookListings = getFacebookListings(fbListingsStore)

    const result = await calculateArbitrage({
      ebayListings,
      priceChartingCards,
      tcgplayerCards,
      facebookListings,
    })

    const response = {
      ...result,
      fbListings: fbListingsStore, // Return so UI can manage them
      scrapeTime: Date.now() - startTime,
      fromCache: false,
    }

    // Cache the result
    cache.set('arbitrage-results', response)

    return res.status(200).json(response)

  } catch (err) {
    console.error('[API] Fatal error:', err)
    return res.status(500).json({
      error: 'Failed to fetch arbitrage data',
      detail: err.message,
    })
  }
}
