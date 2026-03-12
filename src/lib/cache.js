/**
 * Simple in-memory cache for scraper results
 * Prevents re-scraping on every page load — data refreshes every 30 min
 */

const NodeCache = require('node-cache')

// TTL in seconds — default 30 minutes
const TTL = parseInt(process.env.CACHE_TTL || '1800')
const cache = new NodeCache({ stdTTL: TTL, checkperiod: 120 })

function get(key) {
  return cache.get(key)
}

function set(key, value) {
  cache.set(key, value)
}

function del(key) {
  cache.del(key)
}

function getStats() {
  return {
    keys: cache.keys(),
    stats: cache.getStats(),
  }
}

module.exports = { get, set, del, getStats, TTL }
