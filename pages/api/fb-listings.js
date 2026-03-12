/**
 * /api/fb-listings
 *
 * Facebook Marketplace does NOT have a public API.
 * Meta removed marketplace API access in 2018.
 *
 * This route handles manually-submitted FB Marketplace listings
 * that users paste in from their local search, and uses Claude AI
 * to parse the listing text and extract card details, grade, and price.
 *
 * Workflow:
 *  1. User opens FB Marketplace, searches "PSA Pokemon Calgary"
 *  2. User pastes a listing title + price into PokéArb
 *  3. This route uses Claude to parse the listing and return structured data
 *  4. The parsed listing gets added to the arbitrage table
 *
 * Future upgrade path: Browser extension that scrapes FB Marketplace
 * listings and POSTs them here automatically.
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { listingText, priceCAD, sellerLocation } = req.body

  if (!listingText) return res.status(400).json({ error: 'listingText is required' })

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_api_key_here') {
    return res.status(200).json({ listing: parseDemoListing(listingText, priceCAD, sellerLocation) })
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `You parse Facebook Marketplace Pokémon card listings. 
Extract structured data and respond ONLY with valid JSON (no markdown):
{
  "cardName": "Card name",
  "set": "Set name if mentioned",
  "grader": "PSA|BGS|CGC|ACE|unknown",
  "grade": "10|9.5|9|8|unknown",
  "isGraded": true/false,
  "condition": "description",
  "notes": "any red flags or notable details"
}`,
      messages: [{
        role: 'user',
        content: `Parse this FB Marketplace listing:\n"${listingText}"\nPrice: $${priceCAD} CAD\nLocation: ${sellerLocation || 'Calgary, AB'}`
      }]
    })

    const raw = response.content.map(b => b.text || '').join('')
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    const emoji = getCardEmoji(listingText)

    return res.status(200).json({
      listing: {
        id: `fb-${Date.now()}`,
        title: listingText,
        emoji,
        grader: parsed.grader || 'unknown',
        grade: parsed.grade || '?',
        priceCad: parseFloat(priceCAD) || 0,
        platform: 'Facebook Marketplace',
        platformColor: 'plat-fb',
        localDistance: sellerLocation || 'Calgary area',
        isGraded: parsed.isGraded,
        notes: parsed.notes,
        url: 'https://www.facebook.com/marketplace/category/pokemon-cards',
        spreadPct: null,
        netProfitCad: null,
      }
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

function getCardEmoji(title) {
  const t = title.toUpperCase()
  if (t.includes('CHARIZARD')) return '🔥'
  if (t.includes('PIKACHU'))   return '⚡'
  if (t.includes('UMBREON'))   return '🌙'
  if (t.includes('RAYQUAZA'))  return '🐉'
  if (t.includes('LUGIA'))     return '🌊'
  if (t.includes('MEWTWO'))    return '🔮'
  return '✨'
}

function parseDemoListing(text, price, location) {
  return {
    id: `fb-${Date.now()}`,
    title: text,
    emoji: getCardEmoji(text),
    grader: 'PSA',
    grade: '10',
    priceCad: parseFloat(price) || 1200,
    platform: 'Facebook Marketplace',
    platformColor: 'plat-fb',
    localDistance: location || 'Calgary area',
    isGraded: true,
    notes: 'Parsed from manual entry',
    url: 'https://www.facebook.com/marketplace',
    spreadPct: 28,
    netProfitCad: 210,
  }
}
