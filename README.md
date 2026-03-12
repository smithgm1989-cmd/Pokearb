# PokeArb — Graded Pokémon Card Arbitrage Tracker

Scans eBay.ca sold listings, PriceCharting, and TCGPlayer for graded Pokémon cards
over $1,000 CAD and surfaces cross-platform arbitrage opportunities ranked by ROI.
Built for Calgary, AB — includes Facebook Marketplace manual entry for local deals.

---

## Quick Start

```
npm install
npm run dev
```

Open http://localhost:3000

---

## Data Sources

| Source | What it provides | Method |
|---|---|---|
| **eBay.ca** | Actual sold prices (completed listings) | Scraping |
| **PriceCharting** | Price history, volume trends, 30-day sales counts | Scraping |
| **TCGPlayer** | Market price (rolling avg of real sales), seller count | Scraping |
| **Facebook Marketplace** | Local Calgary deals | Manual entry in UI |

---

## How the Arbitrage Engine Works

1. Scrapes eBay.ca *completed/sold* listings — only real transactions, not listed prices
2. Groups sold listings by card + grade, calculates median sell price
3. Compares buy opportunities (PriceCharting reference, FB local deals) against eBay sell prices
4. Deducts platform fees (eBay: 13.25% + 3% processing + ~$15 shipping)
5. Scores each opportunity 0–100 based on ROI margin, volume trend, and data confidence
6. Highlights supply/demand signals — "Volume surging 🔥" vs "Supply drying up ⚠"

---

## Volume & Price Trend Signals

The app tracks 30-day vs prior-30-day sales counts from PriceCharting:

- 🔥 **Volume surging** — Sales up >50% vs prior month. High demand, prices likely rising.
- ↑ **Volume rising** — Sales up 20–50%. Growing interest.
- → **Stable** — Sales roughly flat. Mature market.
- ↓ **Volume slowing** — Sales down 20–50%. Could indicate waning interest.
- ⚠ **Supply drying up** — Sales down >50%. Fewer cards available = potential price spike.

---

## Facebook Marketplace (Calgary)

Because Facebook has no public API and actively blocks scrapers:

1. Click **"📍 Add FB Listing"** in the top right
2. Enter card name, grading company/grade, asking price in CAD
3. The app will cross-reference it against eBay comps and calculate your potential flip profit
4. Local Calgary deals get a +15 score bonus (no shipping risk, cash deal)

**Manual FB search links** (opens Calgary-filtered Marketplace):
- [PSA Pokemon Calgary](https://www.facebook.com/marketplace/calgary/search/?query=PSA+pokemon)
- [Graded Pokemon Card Calgary](https://www.facebook.com/marketplace/calgary/search/?query=graded+pokemon+card)

---

## Deploying to Vercel

```
git init
git checkout -b main
git add .
git commit -m "pokearb init"
git remote add origin https://github.com/YOUR_USERNAME/pokearb.git
git push -u origin main
```

Then import the repo in Vercel — no environment variables needed for the scraping approach.

---

## Upgrading to eBay Official API (Optional)

The current build scrapes eBay's public completed listings page.
For higher rate limits and richer data, get official eBay API credentials:

1. Go to https://developer.ebay.com and create an account
2. Create a **Production** app (not sandbox)
3. Add to `.env.local`:
   ```
   EBAY_CLIENT_ID=your_client_id
   EBAY_CLIENT_SECRET=your_client_secret
   ```
4. The `src/scrapers/ebay-api.js` file (add when ready) will use the
   `marketplace_insights` endpoint for sold price data with no scraping needed.

---

## Limitations & Honest Notes

- **Scraping can break** if eBay/PriceCharting/TCGPlayer update their HTML structure.
  If data stops appearing, check the console — the scrapers log what they find.
- **Prices are estimates** — always verify on the platform before buying.
- **Facebook Marketplace data is manual** — the app cannot auto-scan it.
- Data is cached for 30 minutes (set `CACHE_TTL` in `.env.local` to change).
- This is a research tool, not financial advice. Do your own due diligence.

---

## Tech Stack

- **Next.js 14** (Pages Router)
- **Cheerio** — HTML parsing / scraping
- **Axios** — HTTP requests
- **node-cache** — in-memory result caching
- **Vercel** — hosting & serverless functions
