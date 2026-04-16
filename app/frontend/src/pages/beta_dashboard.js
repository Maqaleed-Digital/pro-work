'use strict'

/**
 * S39-G6 Beta Dashboard — /admin/beta
 *
 * RAG scorecard for S39 exit criteria:
 *   - p75 Time to First Proposal ≤4h
 *   - Match Rate ≥45%
 *   - Payout ETA Breach Rate <1%
 *   - Accessibility AA Pass Rate ≥95%
 *
 * Beta enrollment counts vs limits.
 * "Request CEO Exit Review" button — visually distinct, enabled ONLY when all criteria GREEN.
 */

/* ── RAG colours ─────────────────────────────────────────────────────────── */

const RAG = {
  GREEN:   { bg: '#f0fdf4', border: '#1a7f37', text: '#1a7f37', label: 'GREEN'  },
  AMBER:   { bg: '#fffbeb', border: '#b45309', text: '#b45309', label: 'AMBER'  },
  RED:     { bg: '#fef2f2', border: '#dc2626', text: '#dc2626', label: 'RED'    },
  GREY:    { bg: '#f9fafb', border: '#9ca3af', text: '#6b7280', label: 'NO DATA' },
  UNKNOWN: { bg: '#f9fafb', border: '#9ca3af', text: '#6b7280', label: '—'      },
}

/* ── Formatters ──────────────────────────────────────────────────────────── */

function fmtValue(key, value) {
  if (value === null || value === undefined) return '—'
  switch (key) {
    case 'p75_time_to_first_proposal':
      return (value / 3600).toFixed(1) + 'h'
    case 'match_rate':
    case 'payout_eta_breach_rate':
    case 'accessibility_aa_pass_rate':
      return (value * 100).toFixed(1) + '%'
    default:
      return String(value)
  }
}

function fmtTarget(key, target, direction) {
  const sym = direction === 'lte' ? '≤' : '≥'
  return sym + fmtValue(key, target)
}

/* ── KPI scorecard row ───────────────────────────────────────────────────── */

function buildKpiRow(key, kpi) {
  const rag    = RAG[kpi.rag] || RAG.UNKNOWN
  const valStr = fmtValue(key, kpi.value)
  const tgtStr = fmtTarget(key, kpi.target, kpi.direction)

  const row = document.createElement('div')
  row.className = 'beta-kpi-row'
  row.style.cssText = [
    'display:flex', 'align-items:center', 'gap:1rem',
    'padding:0.75rem 1rem', 'margin-block-end:0.5rem',
    `background:${rag.bg}`, `border:1.5px solid ${rag.border}`,
    'border-radius:8px',
  ].join(';')

  // RAG badge
  const badge = document.createElement('span')
  badge.className = 'beta-rag-badge'
  badge.style.cssText = [
    `background:${rag.border}`, 'color:#fff',
    'font-size:0.7rem', 'font-weight:700', 'letter-spacing:0.04em',
    'padding:0.2rem 0.55rem', 'border-radius:4px', 'min-width:4.5rem',
    'text-align:center', 'flex-shrink:0',
  ].join(';')
  badge.textContent = rag.label

  // Label
  const label = document.createElement('span')
  label.className = 'beta-kpi-label'
  label.style.cssText = 'flex:1; font-size:0.9rem; color:#111;'
  label.textContent = kpi.label

  // Value / target
  const metric = document.createElement('span')
  metric.className = 'beta-kpi-metric'
  metric.style.cssText = `font-size:0.9rem; font-weight:600; color:${rag.text}; white-space:nowrap;`
  metric.textContent = valStr + ' (target: ' + tgtStr + ')'

  row.appendChild(badge)
  row.appendChild(label)
  row.appendChild(metric)
  return row
}

/* ── Enrollment table ────────────────────────────────────────────────────── */

function buildEnrollmentTable(snapshot) {
  const wrap = document.createElement('div')
  wrap.className = 'beta-enrollment-table'
  wrap.style.cssText = 'margin-block-end:1.5rem;'

  const title = document.createElement('h3')
  title.textContent = 'Beta Enrollment'
  title.style.cssText = 'font-size:1rem; margin-block-end:0.75rem; color:#111;'
  wrap.appendChild(title)

  const types = [
    { key: 'employer',   label: 'Employers' },
    { key: 'freelancer', label: 'Freelancers' },
    { key: 'fte',        label: 'FTE Workers' },
  ]

  for (const { key, label } of types) {
    const current = snapshot[key] || 0
    const max     = snapshot.limits && snapshot.limits[key]
    const pct     = max ? current / max : 0
    const barColor = pct >= 0.9 ? '#dc2626' : pct >= 0.7 ? '#b45309' : '#1a7f37'

    const row = document.createElement('div')
    row.style.cssText = 'display:flex; align-items:center; gap:0.75rem; margin-block-end:0.5rem;'

    const lbl = document.createElement('span')
    lbl.style.cssText = 'min-width:9rem; font-size:0.85rem; color:#555;'
    lbl.textContent = label

    const track = document.createElement('div')
    track.style.cssText = 'flex:1; height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden;'
    const fill = document.createElement('div')
    fill.style.cssText = `width:${(pct * 100).toFixed(1)}%; height:100%; background:${barColor}; transition:width 0.3s;`
    track.appendChild(fill)

    const count = document.createElement('span')
    count.style.cssText = 'font-size:0.85rem; font-weight:600; color:#111; min-width:4rem; text-align:end;'
    count.textContent = `${current} / ${max}`

    row.appendChild(lbl)
    row.appendChild(track)
    row.appendChild(count)
    wrap.appendChild(row)
  }

  return wrap
}

/* ── CEO Exit Review button ──────────────────────────────────────────────── */

function buildExitButton(allGreen, onRequest) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'margin-block-start:1.5rem; padding-block-start:1.25rem; border-block-start:1px solid #e5e7eb;'

  const note = document.createElement('p')
  note.style.cssText = 'font-size:0.8rem; color:#6b7280; margin-block-end:0.75rem;'
  note.textContent = allGreen
    ? 'All exit criteria are GREEN. You may request CEO review to proceed to S39-G7.'
    : 'Exit review requires all criteria to be GREEN. Resolve outstanding items first.'
  wrap.appendChild(note)

  const btn = document.createElement('button')
  btn.className   = 'beta-ceo-exit-btn'
  btn.disabled    = !allGreen
  btn.textContent = 'Request CEO Exit Review'
  btn.style.cssText = [
    'display:block', 'padding:0.7rem 1.5rem',
    'font-size:0.9rem', 'font-weight:700', 'letter-spacing:0.02em',
    'border-radius:8px', 'cursor:pointer',
    'border:2px solid transparent', 'transition:all 0.2s',
    allGreen
      ? 'background:#6c2bdb; color:#fff; border-color:#6c2bdb;'
      : 'background:#e5e7eb; color:#9ca3af; cursor:not-allowed;',
  ].join(';')

  if (allGreen) {
    btn.addEventListener('mouseover',  () => { btn.style.background = '#5b23bc'; btn.style.borderColor = '#5b23bc' })
    btn.addEventListener('mouseout',   () => { btn.style.background = '#6c2bdb'; btn.style.borderColor = '#6c2bdb' })
  }

  btn.addEventListener('click', () => {
    if (!allGreen) return
    btn.disabled    = true
    btn.textContent = 'Sending request…'
    onRequest()
      .then(result => {
        btn.textContent  = 'Request sent — awaiting CEO review'
        btn.style.background    = '#1a7f37'
        btn.style.borderColor   = '#1a7f37'
      })
      .catch(err => {
        btn.disabled    = false
        btn.textContent = 'Request CEO Exit Review'
        const errMsg = document.createElement('p')
        errMsg.style.cssText = 'color:#dc2626; font-size:0.8rem; margin-block-start:0.5rem;'
        errMsg.textContent = 'Error: ' + (err.message || 'Unknown error')
        wrap.appendChild(errMsg)
      })
  })

  wrap.appendChild(btn)
  return wrap
}

/* ── Dashboard factory ───────────────────────────────────────────────────── */

/**
 * createBetaDashboard({ container })
 *
 * Renders the beta dashboard into `container`.
 * Fetches /admin/beta/kpi and /admin/beta/snapshot on mount.
 * Poll interval: 30s.
 */
function createBetaDashboard(opts) {
  const container = opts && opts.container
  if (!container) throw new Error('container is required')

  let _pollTimer = null

  function render(scorecard, snapshot) {
    container.innerHTML = ''

    // Header
    const header = document.createElement('div')
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-block-end:1.25rem;'
    const h2 = document.createElement('h2')
    h2.textContent = 'S39 Beta Exit Criteria'
    h2.style.cssText = 'font-size:1.15rem; font-weight:700; color:#111; margin:0;'
    const verdict = document.createElement('span')
    verdict.style.cssText = [
      'font-size:0.8rem; font-weight:700; padding:0.25rem 0.75rem; border-radius:4px;',
      scorecard.all_green
        ? 'background:#1a7f37; color:#fff;'
        : 'background:#dc2626; color:#fff;',
    ].join('')
    verdict.textContent = scorecard.verdict || (scorecard.all_green ? 'EXIT_READY' : 'NOT_READY')
    header.appendChild(h2)
    header.appendChild(verdict)
    container.appendChild(header)

    // KPI rows
    const kpiSection = document.createElement('section')
    kpiSection.style.cssText = 'margin-block-end:1.5rem;'
    const kpiTitle = document.createElement('h3')
    kpiTitle.textContent = 'Exit Criteria Scorecard'
    kpiTitle.style.cssText = 'font-size:1rem; margin-block-end:0.75rem; color:#111;'
    kpiSection.appendChild(kpiTitle)
    for (const [key, kpi] of Object.entries(scorecard.criteria || {})) {
      kpiSection.appendChild(buildKpiRow(key, kpi))
    }
    container.appendChild(kpiSection)

    // Enrollment table
    if (snapshot) {
      container.appendChild(buildEnrollmentTable(snapshot))
    }

    // CEO exit button
    const exitBtn = buildExitButton(scorecard.all_green, () => {
      return fetch('/admin/beta/ceo-exit-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requested_by: 'admin' }),
      }).then(r => r.json()).then(data => {
        if (!data.ok) throw new Error(data.error && data.error.message || 'Request failed')
        return data
      })
    })
    container.appendChild(exitBtn)

    // Last updated
    const ts = document.createElement('p')
    ts.style.cssText = 'font-size:0.75rem; color:#9ca3af; margin-block-start:1rem;'
    ts.textContent = 'Last updated: ' + new Date().toLocaleTimeString()
    container.appendChild(ts)
  }

  async function refresh() {
    try {
      const [kpiRes, snapRes] = await Promise.all([
        fetch('/admin/beta/kpi').then(r => r.json()),
        fetch('/admin/beta/snapshot').then(r => r.json()),
      ])
      const scorecard = kpiRes.ok    ? kpiRes.data    : { criteria: {}, all_green: false, verdict: 'ERROR' }
      const snapshot  = snapRes.ok   ? snapRes.data   : null
      render(scorecard, snapshot)
    } catch (err) {
      container.innerHTML = `<p style="color:#dc2626">Failed to load beta dashboard: ${err.message}</p>`
    }
  }

  function mount() {
    refresh()
    _pollTimer = setInterval(refresh, 30000)
  }

  function unmount() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  }

  return { mount, unmount, refresh }
}

/* ── Exports ─────────────────────────────────────────────────────────────── */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createBetaDashboard, buildKpiRow, buildExitButton, fmtValue, fmtTarget }
}
