/**
 * Facebook Marketplace Handler
 * 
 * ─────────────────────────────────────────────────────────────
 * IMPORTANT: Facebook Marketplace has NO public API and
 * actively blocks automated scraping with aggressive bot detection
 * (Cloudflare, CAPTCHA, login walls, IP bans).
 * 
 * Automated scraping of Facebook Marketplace is:
 *   1. Against Facebook's Terms of Service
 *   2. Technically very difficult (requires logged-in session)
 *   3. Fragile (breaks constantly as FB updates its frontend)
 * 
 * REALISTIC APPROACHES:
 * ─────────────────────────────────────────────────────────────
 * 
 * Option A (Implemented here): Manual entry system
 *   → User pastes a Facebook Marketplace listing URL or price
 *   → System stores it locally and includes it in arbitrage calc
 *   → Most reliable for Calgary local deals
 * 
 * Option B (Future): Facebook Marketplace RSS/alert emails
 *   → Set up a Marketplace saved search for "Pokemon PSA Calgary"
 *   → Forward alert emails to a parsing endpoint
 *   → Requires manual setup per user but fully automated after
 * 
 * Option C (Third-party): Services like Apify have FB scrapers
 *   → Apify FB Marketplace Actor: ~$0.10/run
 *   → Plug their API into this system if you want automation
 *   → apify.com/misceres/facebook-marketplace-scraper
 * 
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Get manually entered Facebook Marketplace listings
 * These are stored in the app's state/database
 */
function getFacebookListings(manualEntries = []) {
  return manualEntries.map(entry => ({
    source: 'Facebook Marketplace',
    cardName: entry.cardName || 'Unknown Card',
    title: entry.title || entry.cardName,
    price: entry.price || 0,
    currency: 'CAD', // Always CAD for Calgary local
    gradingCompany: entry.gradingCompany || null,
    grade: entry.grade || null,
    location: entry.location || 'Calgary, AB',
    url: entry.url || null,
    isLocal: true,
    enteredAt: entry.enteredAt || new Date().toISOString(),
    notes: entry.notes || '',
    image: entry.image || null,
  }))
}

/**
 * Validate a manually entered FB Marketplace listing
 */
function validateFBEntry(entry) {
  const errors = []
  if (!entry.cardName) errors.push('Card name is required')
  if (!entry.price || entry.price <= 0) errors.push('Price must be a positive number')
  if (entry.price < 1000) errors.push('Only tracking cards over $1,000 CAD')
  return errors
}

/**
 * Format a Facebook Marketplace URL for display
 * FB URLs look like: https://www.facebook.com/marketplace/item/1234567890
 */
function formatFBUrl(url) {
  if (!url) return null
  const match = url.match(/marketplace\/item\/(\d+)/)
  if (match) return `https://www.facebook.com/marketplace/item/${match[1]}`
  return url
}

/**
 * Generate a search URL for Facebook Marketplace in Calgary
 * Users can open this directly to search manually
 */
function getFBSearchUrl(query) {
  const params = new URLSearchParams({
    query: query,
    exact: false,
  })
  // Calgary, AB coordinates: 51.0447, -114.0719
  return `https://www.facebook.com/marketplace/calgary/search/?${params}`
}

const FB_SEARCH_SUGGESTIONS = [
  { label: 'PSA Pokémon Calgary', url: getFBSearchUrl('PSA pokemon') },
  { label: 'Graded Pokémon Calgary', url: getFBSearchUrl('graded pokemon card') },
  { label: 'Charizard PSA Calgary', url: getFBSearchUrl('charizard PSA 10') },
  { label: 'Pokémon Slab Calgary', url: getFBSearchUrl('pokemon slab') },
]

module.exports = {
  getFacebookListings,
  validateFBEntry,
  formatFBUrl,
  getFBSearchUrl,
  FB_SEARCH_SUGGESTIONS,
}
