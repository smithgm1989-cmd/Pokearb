import dynamic from 'next/dynamic'

const PokeArb = dynamic(() => Promise.resolve(PokeArbApp), { ssr: false })
export default PokeArb

import { useState, useEffect, useCallback, useRef } from 'react'

// ── CONSTANTS ──
const SORT_OPTIONS = [
  { value: 'score',     label: '⭐ Best Deal Score' },
  { value: 'roi',       label: '📈 Highest ROI %' },
  { value: 'profit',    label: '💰 Highest Net Profit' },
  { value: 'buyPrice',  label: '💲 Buy Price (Low→High)' },
  { value: 'volume',    label: '🔥 Volume Trend' },
]

const VOLUME_COLORS = {
  green:  '#4caf7d',
  orange: '#e07d35',
  yellow: '#d4a843',
  blue:   '#4a9eff',
  gray:   '#666',
}

const PLATFORM_ICONS = {
  'eBay':                 '🛒',
  'TCGPlayer':            '🃏',
  'PriceCharting':        '📊',
  'Facebook Marketplace': '📍',
}

function fmt(n)       { return n == null ? '—' : `$${Math.round(n).toLocaleString()}` }
function fmtDec(n)    { return n == null ? '—' : `$${n.toFixed(2)}` }
function fmtPct(n)    { return n == null ? '—' : `${n.toFixed(1)}%` }
function fmtNum(n)    { return n == null ? '—' : n.toLocaleString() }

// ── SCORE BADGE ──
function ScoreBadge({ score }) {
  const color = score >= 70 ? '#4caf7d' : score >= 40 ? '#d4a843' : '#e07d35'
  const label = score >= 70 ? 'HOT' : score >= 40 ? 'GOOD' : 'FAIR'
  return (
    <div className="score-badge" style={{ borderColor: color, color }}>
      <div className="score-num" style={{ color }}>{score}</div>
      <div className="score-label" style={{ color }}>{label}</div>
    </div>
  )
}

// ── VOLUME PILL ──
function VolumePill({ signal, last30, prior30 }) {
  if (!signal) return null
  const color = VOLUME_COLORS[signal.color] || '#666'
  return (
    <div className="volume-pill" style={{ borderColor: color, color }}>
      <span className="vol-icon">{signal.icon}</span>
      <span className="vol-label">{signal.label}</span>
      {last30 != null && (
        <span className="vol-count">{last30} sales/30d</span>
      )}
    </div>
  )
}

// ── PRICE TREND INDICATOR ──
function PriceTrend({ trend }) {
  if (!trend || trend === 'unknown' || trend === 'stable') return null
  const rising = trend === 'rising'
  return (
    <span className={`price-trend ${rising ? 'trend-up' : 'trend-down'}`}>
      {rising ? '↑ Price rising' : '↓ Price falling'}
    </span>
  )
}

// ── OPPORTUNITY CARD ──
function OpportunityCard({ opp, rank }) {
  const [expanded, setExpanded] = useState(false)
  const isHot = opp.score >= 70
  const isLocal = opp.isLocal

  return (
    <div className={`opp-card ${isHot ? 'opp-hot' : ''} ${isLocal ? 'opp-local' : ''}`}>
      {rank <= 3 && (
        <div className="rank-banner" style={{ background: rank === 1 ? '#d4a843' : rank === 2 ? '#999' : '#c47a2a' }}>
          #{rank} {rank === 1 ? '🏆 Top Deal' : rank === 2 ? '🥈 #2' : '🥉 #3'}
        </div>
      )}

      <div className="opp-main">
        {/* LEFT: Score */}
        <ScoreBadge score={opp.score} />

        {/* CENTER: Card info */}
        <div className="opp-center">
          <div className="opp-name">{opp.cardName}</div>
          <div className="opp-grade-row">
            {opp.gradingCompany && (
              <span className="grade-badge">
                {opp.gradingCompany} {opp.grade}
              </span>
            )}
            {isLocal && <span className="local-badge">📍 Calgary Local</span>}
            <PriceTrend trend={opp.priceTrend} />
          </div>
          <div className="opp-platforms">
            <span className="platform-buy">
              {PLATFORM_ICONS[opp.buyPlatform]} Buy on {opp.buyPlatform}
              <strong> {fmt(opp.buyPriceCad)} CAD</strong>
            </span>
            <span className="platform-arrow">→</span>
            <span className="platform-sell">
              {PLATFORM_ICONS[opp.sellPlatform]} Sell on {opp.sellPlatform}
              <strong> {fmt(opp.sellPriceCad)} CAD</strong>
            </span>
          </div>
          <VolumePill signal={opp.volumeSignal} last30={opp.last30DaySales} prior30={opp.prior30DaySales} />
        </div>

        {/* RIGHT: Profit */}
        <div className="opp-right">
          <div className="opp-profit" style={{ color: opp.netProfit > 0 ? '#4caf7d' : '#e05555' }}>
            {opp.netProfit > 0 ? '+' : ''}{fmt(opp.netProfit)}
          </div>
          <div className="opp-roi" style={{ color: opp.roi > 0 ? '#4caf7d' : '#e05555' }}>
            {fmtPct(opp.roi)} ROI
          </div>
          <button className="expand-btn" onClick={() => setExpanded(e => !e)}>
            {expanded ? '▲ Less' : '▼ Details'}
          </button>
        </div>
      </div>

      {/* EXPANDED DETAILS */}
      {expanded && (
        <div className="opp-details">
          <div className="detail-grid">
            <div className="detail-section">
              <div className="detail-title">COST BREAKDOWN</div>
              <div className="detail-row"><span>Buy price</span><span className="dr-neg">{fmt(opp.buyPriceCad)}</span></div>
              <div className="detail-row"><span>Est. sell price</span><span>{fmt(opp.sellPriceCad)}</span></div>
              <div className="detail-row"><span>Platform fees (~16.25%)</span><span className="dr-neg">-{fmt(opp.sellPriceCad * 0.1625)}</span></div>
              <div className="detail-row"><span>Est. shipping</span><span className="dr-neg">-{fmt(isLocal ? 0 : 15)}</span></div>
              <div className="detail-row detail-total"><span>Net profit</span><span style={{ color: opp.netProfit > 0 ? '#4caf7d' : '#e05555' }}>{opp.netProfit > 0 ? '+' : ''}{fmt(opp.netProfit)}</span></div>
              {opp.exchangeRate && opp.buyPlatform !== 'Facebook Marketplace' && (
                <div className="detail-note">USD→CAD rate: {opp.exchangeRate}</div>
              )}
            </div>

            <div className="detail-section">
              <div className="detail-title">SALES VOLUME</div>
              <div className="detail-row"><span>Last 30 days</span><span>{fmtNum(opp.last30DaySales)} sales</span></div>
              <div className="detail-row"><span>Prior 30 days</span><span>{fmtNum(opp.prior30DaySales)} sales</span></div>
              <div className="detail-row"><span>Trend</span>
                <span style={{ color: VOLUME_COLORS[opp.volumeSignal?.color] }}>
                  {opp.volumeSignal?.icon} {opp.volumeSignal?.label}
                </span>
              </div>
              {opp.priceTrend && opp.priceTrend !== 'unknown' && (
                <div className="detail-row"><span>Price trend</span><span>{opp.priceTrend}</span></div>
              )}
            </div>

            {opp.recentSales && opp.recentSales.length > 0 && (
              <div className="detail-section detail-section-full">
                <div className="detail-title">RECENT SALES (via PriceCharting)</div>
                <div className="recent-sales-list">
                  {opp.recentSales.slice(0, 8).map((s, i) => (
                    <div key={i} className="recent-sale">
                      <span className="rs-date">{s.date}</span>
                      <span className="rs-grade">{s.grade}</span>
                      <span className="rs-price">${s.price?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="detail-actions">
            {opp.sourceUrls?.buy && (
              <a href={opp.sourceUrls.buy} target="_blank" rel="noopener noreferrer" className="action-btn action-buy">
                {PLATFORM_ICONS[opp.buyPlatform]} View Buy Listing
              </a>
            )}
            <a
              href={`https://www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent((opp.cardName || '') + ' ' + (opp.gradingCompany || '') + ' ' + (opp.grade || ''))}&LH_Sold=1&LH_Complete=1`}
              target="_blank" rel="noopener noreferrer"
              className="action-btn action-sell"
            >
              🛒 View eBay Comps
            </a>
            <a
              href={`https://www.pricecharting.com/search-products?q=${encodeURIComponent(opp.cardName || '')}&type=prices`}
              target="_blank" rel="noopener noreferrer"
              className="action-btn action-ref"
            >
              📊 PriceCharting History
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FACEBOOK ENTRY MODAL ──
function FBModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ cardName: '', price: '', gradingCompany: 'PSA', grade: '10', url: '', notes: '' })
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    setSaving(true)
    const entry = { ...form, price: parseFloat(form.price) || 0, location: 'Calgary, AB' }
    try {
      const resp = await fetch('/api/arbitrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      const data = await resp.json()
      if (!resp.ok) { setErrors(data.errors || ['Failed to add listing']); setSaving(false); return }
      onAdd(data.entry)
      onClose()
    } catch {
      setErrors(['Network error — try again'])
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">📍 Add Facebook Marketplace Listing</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-note">
            Facebook Marketplace can't be scraped automatically. Enter a Calgary listing here and it'll be included in the arbitrage calculations.
          </p>

          {errors.length > 0 && (
            <div className="modal-errors">
              {errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
            </div>
          )}

          <div className="form-row">
            <label>Card Name *</label>
            <input placeholder="e.g. Charizard VMAX Alt Art PSA 10" value={form.cardName} onChange={e => set('cardName', e.target.value)} />
          </div>
          <div className="form-row-split">
            <div className="form-row">
              <label>Grading Company</label>
              <select value={form.gradingCompany} onChange={e => set('gradingCompany', e.target.value)}>
                <option>PSA</option><option>BGS</option><option>CGC</option><option>ACE</option>
              </select>
            </div>
            <div className="form-row">
              <label>Grade</label>
              <select value={form.grade} onChange={e => set('grade', e.target.value)}>
                {['10','9.5','9','8.5','8','7'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>Asking Price (CAD) *</label>
            <input type="number" placeholder="1500" value={form.price} onChange={e => set('price', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Facebook URL (optional)</label>
            <input placeholder="https://www.facebook.com/marketplace/item/..." value={form.url} onChange={e => set('url', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Notes (optional)</label>
            <input placeholder="Seller willing to negotiate, pick up Kensington..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-add" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Adding...' : '+ Add to Tracker'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── STATS BAR ──
function StatsBar({ data }) {
  if (!data) return null
  const { opportunities = [], totalScanned, exchangeRate, generatedAt, scrapeTime, fromCache } = data
  const topROI = opportunities[0]?.roi || 0
  const topProfit = opportunities[0]?.netProfit || 0
  const hotDeals = opportunities.filter(o => o.score >= 70).length

  return (
    <div className="stats-bar">
      <div className="stat"><div className="stat-val">{opportunities.length}</div><div className="stat-label">Opportunities</div></div>
      <div className="stat"><div className="stat-val" style={{ color: '#4caf7d' }}>{hotDeals}</div><div className="stat-label">Hot Deals</div></div>
      <div className="stat"><div className="stat-val">{fmtNum(totalScanned)}</div><div className="stat-label">Listings Scanned</div></div>
      <div className="stat"><div className="stat-val" style={{ color: '#4caf7d' }}>{fmtPct(topROI)}</div><div className="stat-label">Best ROI</div></div>
      <div className="stat"><div className="stat-val" style={{ color: '#4caf7d' }}>{fmt(topProfit)}</div><div className="stat-label">Best Profit</div></div>
      <div className="stat"><div className="stat-val">1 USD = {exchangeRate} CAD</div><div className="stat-label">Exchange Rate</div></div>
      <div className="stat">
        <div className="stat-val" style={{ fontSize: 11 }}>
          {fromCache ? '⚡ Cached' : '🔄 Live'} · {scrapeTime ? `${(scrapeTime/1000).toFixed(1)}s` : ''}
        </div>
        <div className="stat-label">{generatedAt ? new Date(generatedAt).toLocaleTimeString() : ''}</div>
      </div>
    </div>
  )
}

// ── MAIN APP ──
function PokeArbApp() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [sortBy, setSortBy]     = useState('score')
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterMinROI, setFilterMinROI]     = useState(0)
  const [showFBModal, setShowFBModal]       = useState(false)
  const [lastFetch, setLastFetch]           = useState(null)

  const fetchData = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/arbitrage${force ? '?refresh=1' : ''}`
      const resp = await fetch(url)
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.error || `HTTP ${resp.status}`)
      }
      const json = await resp.json()
      setData(json)
      setLastFetch(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Sort & filter opportunities
  const filtered = (data?.opportunities || [])
    .filter(o => filterPlatform === 'all' || o.buyPlatform === filterPlatform)
    .filter(o => o.roi >= filterMinROI)
    .sort((a, b) => {
      if (sortBy === 'score')    return b.score - a.score
      if (sortBy === 'roi')      return b.roi - a.roi
      if (sortBy === 'profit')   return b.netProfit - a.netProfit
      if (sortBy === 'buyPrice') return a.buyPriceCad - b.buyPriceCad
      if (sortBy === 'volume')   return (b.last30DaySales || 0) - (a.last30DaySales || 0)
      return 0
    })

  const platforms = ['all', ...new Set((data?.opportunities || []).map(o => o.buyPlatform))]

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <div className="logo">PokeArb</div>
          <div className="logo-sub">Graded Card Arbitrage · Calgary, AB 🇨🇦</div>
        </div>
        <div className="header-right">
          <button className="btn-fb" onClick={() => setShowFBModal(true)}>
            📍 Add FB Listing
          </button>
          <button className="btn-refresh" onClick={() => fetchData(true)} disabled={loading}>
            {loading ? '⏳ Scanning...' : '🔄 Refresh Data'}
          </button>
        </div>
      </header>

      {/* TICKER — hot deals */}
      {!loading && filtered.length > 0 && (
        <div className="ticker-wrap">
          <div className="ticker-label">🔥 HOT</div>
          <div className="ticker">
            {filtered.filter(o => o.score >= 60).slice(0, 6).map((o, i) => (
              <span key={i} className="ticker-item">
                {o.cardName} — {fmt(o.netProfit)} profit ({fmtPct(o.roi)} ROI)
                {o.volumeSignal?.icon}
              </span>
            ))}
          </div>
        </div>
      )}

      <main className="main">
        {/* STATS BAR */}
        <StatsBar data={data} />

        {/* CONTROLS */}
        <div className="controls">
          <div className="controls-left">
            <div className="control-group">
              <label>Sort by</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="control-group">
              <label>Buy platform</label>
              <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
                {platforms.map(p => <option key={p} value={p}>{p === 'all' ? 'All platforms' : p}</option>)}
              </select>
            </div>
            <div className="control-group">
              <label>Min ROI: {filterMinROI}%</label>
              <input type="range" min="0" max="50" step="5" value={filterMinROI}
                onChange={e => setFilterMinROI(Number(e.target.value))} />
            </div>
          </div>
          <div className="controls-right">
            <span className="results-count">{filtered.length} opportunities shown</span>
          </div>
        </div>

        {/* DATA SOURCE NOTICE */}
        <div className="source-notice">
          <strong>Data sources:</strong> eBay.ca sold listings · PriceCharting (eBay aggregated) · TCGPlayer market price · Manual FB Marketplace entries · Min $1,000 CAD · Graded slabs only
        </div>

        {/* ERROR */}
        {error && (
          <div className="error-box">
            <div className="error-title">⚠ Data fetch error</div>
            <div className="error-msg">{error}</div>
            <button onClick={() => fetchData(true)}>Retry</button>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="loading-wrap">
            <div className="loading-spinner" />
            <div className="loading-text">Scanning eBay.ca · PriceCharting · TCGPlayer</div>
            <div className="loading-sub">Analyzing sold prices & volume trends…</div>
          </div>
        )}

        {/* EMPTY */}
        {!loading && !error && data && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No arbitrage opportunities found</div>
            <div className="empty-sub">
              Try lowering the minimum ROI filter, or refresh to pull fresh data.
              You can also add local Facebook Marketplace deals manually.
            </div>
            <div className="empty-fb-links">
              <strong>Search Facebook Marketplace Calgary:</strong>
              <div className="fb-links">
                {['PSA pokemon', 'graded pokemon card', 'charizard PSA 10', 'pokemon slab'].map(q => (
                  <a key={q}
                    href={`https://www.facebook.com/marketplace/calgary/search/?query=${encodeURIComponent(q)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="fb-link"
                  >
                    🔍 {q}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OPPORTUNITY LIST */}
        {!loading && filtered.length > 0 && (
          <div className="opp-list">
            {filtered.map((opp, i) => (
              <OpportunityCard key={opp.id || i} opp={opp} rank={i + 1} />
            ))}
          </div>
        )}

        {/* FB MANUAL LISTINGS */}
        {data?.fbListings?.length > 0 && (
          <div className="fb-section">
            <div className="fb-section-title">📍 Your Facebook Marketplace Listings (Calgary)</div>
            {data.fbListings.map(fb => (
              <div key={fb.id} className="fb-entry">
                <div className="fb-entry-name">{fb.cardName}</div>
                <div className="fb-entry-meta">
                  {fb.gradingCompany} {fb.grade} · {fmt(fb.price)} CAD · Added {new Date(fb.enteredAt).toLocaleDateString()}
                </div>
                {fb.notes && <div className="fb-entry-notes">{fb.notes}</div>}
                <button className="fb-remove" onClick={async () => {
                  await fetch(`/api/arbitrage?id=${fb.id}`, { method: 'DELETE' })
                  fetchData(true)
                }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </main>

      {showFBModal && (
        <FBModal
          onClose={() => setShowFBModal(false)}
          onAdd={() => { setShowFBModal(false); fetchData(true) }}
        />
      )}
    </div>
  )
}
