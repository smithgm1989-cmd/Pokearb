// pages/api/analyze.js
// Uses Claude to analyze card listings and identify arbitrage spreads

import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { listings } = req.body
  if (!listings || !listings.length) return res.status(400).json({ error: 'No listings provided' })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `You are a Pokemon TCG graded card arbitrage expert. I have the following graded card listings from eBay (all over $1000 CAD). Analyze them for arbitrage opportunities.

Listings:
${JSON.stringify(listings.slice(0, 30), null, 2)}

For each listing, assess:
1. Whether the price is above or below typical market value
2. The arbitrage opportunity (buy low on one platform, sell higher elsewhere)
3. Grade the opportunity: HOT (>20% spread), WARM (10-20%), COLD (<10% or overpriced)

Return ONLY a JSON array (no markdown, no backticks) where each item has:
{
  "itemId": "original item id",
  "title": "cleaned card name",
  "gradingCompany": "PSA/BGS/CGC/ACE",
  "grade": "10/9.5/9/etc",
  "cardName": "just the pokemon card name",
  "currentPriceCad": 1234,
  "estimatedMarketCad": 1300,
  "spreadPercent": 5.2,
  "spreadDollarCad": 66,
  "netProfitCad": 45,
  "opportunityTier": "HOT/WARM/COLD",
  "buyRecommendation": "one sentence on whether to buy",
  "sellPlatform": "best platform to sell on",
  "notes": "one sentence insight"
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content.map(b => b.text || '').join('')
    const clean = raw.replace(/```json|```/g, '').trim()
    const analyzed = JSON.parse(clean)

    return res.status(200).json({ analyzed })
  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: err.message })
  }
}
