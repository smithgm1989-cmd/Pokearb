// pages/api/listings.js
// Fetches graded Pokemon card listings from eBay over $1000 CAD

import { searchGradedCards } from '../../lib/ebay'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { q = 'PSA graded Pokemon card' } = req.query

  // Check if eBay credentials exist
  if (!process.env.EBAY_CLIENT_ID || process.env.EBAY_CLIENT_ID === 'your_ebay_client_id') {
    // Return rich mock data so the UI is fully testable without eBay API keys
    return res.status(200).json({ listings: getMockListings(), mock: true })
  }

  try {
    const listings = await searchGradedCards(q)
    return res.status(200).json({ listings, mock: false })
  } catch (err) {
    console.error('eBay fetch error:', err)
    // Fall back to mock on error
    return res.status(200).json({ listings: getMockListings(), mock: true, error: err.message })
  }
}

function getMockListings() {
  return [
    {
      id: 'mock-001',
      title: 'PSA 10 Charizard VMAX Alt Art Evolving Skies 203/203',
      price_usd: 890,
      price_cad: 1219,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=PSA+10+Charizard+VMAX+Alt+Art',
      seller: 'pokevault_ca',
      platform: 'eBay',
      location: 'CA',
    },
    {
      id: 'mock-002',
      title: 'BGS 9.5 Umbreon VMAX Alt Art Evolving Skies 215/203',
      price_usd: 1020,
      price_cad: 1397,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=BGS+9.5+Umbreon+VMAX+Alt+Art',
      seller: 'graded_gems',
      platform: 'eBay',
      location: 'US',
    },
    {
      id: 'mock-003',
      title: 'PSA 10 Rayquaza VMAX Alt Art Evolving Skies 203/203 Gem Mint',
      price_usd: 760,
      price_cad: 1041,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=PSA+10+Rayquaza+VMAX',
      seller: 'slabmaster99',
      platform: 'eBay',
      location: 'US',
    },
    {
      id: 'mock-004',
      title: 'PSA 9 Base Set Charizard Holo 4/102 1999 Shadowless',
      price_usd: 2800,
      price_cad: 3836,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=PSA+9+Base+Set+Charizard+Shadowless',
      seller: 'vintage_slabs',
      platform: 'eBay',
      location: 'CA',
    },
    {
      id: 'mock-005',
      title: 'CGC 10 Lugia V Alt Art Silver Tempest 186/195',
      price_usd: 780,
      price_cad: 1068,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=CGC+10+Lugia+V+Alt+Art',
      seller: 'cgc_flippers',
      platform: 'eBay',
      location: 'US',
    },
    {
      id: 'mock-006',
      title: 'PSA 10 Pikachu Illustrator Promo 1998 — Trophy Card',
      price_usd: 320000,
      price_cad: 438356,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=PSA+10+Pikachu+Illustrator',
      seller: 'ultra_rare_slabs',
      platform: 'eBay',
      location: 'US',
    },
    {
      id: 'mock-007',
      title: 'PSA 10 Mewtwo VSTAR Rainbow Rare Brilliant Stars 164/172',
      price_usd: 540,
      price_cad: 740,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=PSA+10+Mewtwo+VSTAR+Rainbow',
      seller: 'pokepsa_ca',
      platform: 'eBay',
      location: 'CA',
    },
    {
      id: 'mock-008',
      title: 'BGS 10 Black Label Charizard VSTAR Rainbow Brilliant Stars',
      price_usd: 1450,
      price_cad: 1986,
      condition: 'Used',
      image: null,
      url: 'https://www.ebay.ca/sch/i.html?_nkw=BGS+10+Black+Label+Charizard+VSTAR',
      seller: 'black_label_king',
      platform: 'eBay',
      location: 'US',
    },
  ]
}
