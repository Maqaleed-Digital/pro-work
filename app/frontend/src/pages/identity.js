/**
 * S39-G5 — Work Identity / ERI Score Page
 *
 * Displays for a selected worker:
 *   - Large ERI score with SVG gauge
 *   - Interpretation label (Elite/Excellent/Good/Developing/New)
 *   - 5-component breakdown bars
 *   - Verified project history with verification badges
 *   - Earned identity badges / tokens
 *   - 6-month ERI trend (SVG line chart)
 *   - Share/export: shareable profile link
 *   - Employer-facing summary card (ERI + top 3 signals)
 *
 * All labels in English + Arabic RTL.
 * Logical CSS properties used throughout (margin-inline-*, padding-block-*).
 */

import { apiGet } from "../api.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(tag, attrs, ...children) {
  const e = document.createElement(tag)
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "style") e.style.cssText = v
      else if (k === "class") e.className = v
      else e.setAttribute(k, v)
    })
  }
  children.forEach(c => {
    if (typeof c === "string") e.appendChild(document.createTextNode(c))
    else if (c) e.appendChild(c)
  })
  return e
}

function arSpan(text) {
  return el("span", { dir: "rtl", lang: "ar", class: "eri-ar" }, text)
}

// ── SVG Gauge ─────────────────────────────────────────────────────────────────

/**
 * buildGauge(score, color)
 * Renders an SVG arc gauge showing the ERI score (0–100).
 */
function buildGauge(score, color) {
  const SIZE = 180
  const CX = SIZE / 2
  const CY = SIZE / 2 + 10
  const R = 70
  const STROKE = 14

  // Arc: 210° sweep (from 195° to 345° clockwise)
  const START_DEG = 195
  const SWEEP_DEG = 210

  function polarToXY(deg, r) {
    const rad = (deg - 90) * Math.PI / 180
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
  }

  function arcPath(startDeg, endDeg, r) {
    const s = polarToXY(startDeg, r)
    const e = polarToXY(endDeg, r)
    const large = (endDeg - startDeg) > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const fillDeg = START_DEG + (score / 100) * SWEEP_DEG
  const endDeg  = START_DEG + SWEEP_DEG

  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`)
  svg.setAttribute("width", String(SIZE))
  svg.setAttribute("height", String(SIZE))
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", `ERI Score: ${score} out of 100`)
  svg.style.cssText = "display:block;margin:0 auto"

  // Background arc
  const bg = document.createElementNS(ns, "path")
  bg.setAttribute("d", arcPath(START_DEG, endDeg, R))
  bg.setAttribute("fill", "none")
  bg.setAttribute("stroke", "#e8e8e8")
  bg.setAttribute("stroke-width", String(STROKE))
  bg.setAttribute("stroke-linecap", "round")
  svg.appendChild(bg)

  // Filled arc (score)
  if (score > 0) {
    const fill = document.createElementNS(ns, "path")
    fill.setAttribute("d", arcPath(START_DEG, fillDeg, R))
    fill.setAttribute("fill", "none")
    fill.setAttribute("stroke", color)
    fill.setAttribute("stroke-width", String(STROKE))
    fill.setAttribute("stroke-linecap", "round")
    svg.appendChild(fill)
  }

  // Score label (centred)
  const scoreText = document.createElementNS(ns, "text")
  scoreText.setAttribute("x", String(CX))
  scoreText.setAttribute("y", String(CY + 8))
  scoreText.setAttribute("text-anchor", "middle")
  scoreText.setAttribute("font-size", "38")
  scoreText.setAttribute("font-weight", "800")
  scoreText.setAttribute("fill", color)
  scoreText.textContent = String(score)
  svg.appendChild(scoreText)

  // "/ 100" label
  const maxText = document.createElementNS(ns, "text")
  maxText.setAttribute("x", String(CX))
  maxText.setAttribute("y", String(CY + 26))
  maxText.setAttribute("text-anchor", "middle")
  maxText.setAttribute("font-size", "11")
  maxText.setAttribute("fill", "#888")
  maxText.textContent = "/ 100"
  svg.appendChild(maxText)

  return svg
}

// ── Component bar ─────────────────────────────────────────────────────────────

const COMPONENT_META = {
  on_time_delivery_pct:   { en: "On-time delivery",    ar: "الالتزام بالمواعيد", max: 100, unit: "%" },
  dispute_rate_pct:       { en: "Dispute rate",        ar: "معدل النزاعات",       max: 100, unit: "%", invert: true },
  rehire_rate_pct:        { en: "Rehire rate",         ar: "معدل إعادة التوظيف", max: 100, unit: "%" },
  responsiveness_score:   { en: "Responsiveness",      ar: "سرعة الاستجابة",     max: 100, unit: "" },
  platform_tenure_months: { en: "Platform tenure",     ar: "مدة الخبرة",          max: 60,  unit: " mo" },
}

function buildComponentBar(key, rawValue, meta) {
  const pct = Math.min((rawValue / meta.max) * 100, 100)
  const displayVal = meta.invert
    ? (pct === 0 ? "0% (perfect)" : `${rawValue}%`)
    : `${rawValue}${meta.unit}`

  const barColor = meta.invert
    ? (rawValue === 0 ? "#1a7f37" : rawValue < 5 ? "#0969da" : rawValue < 15 ? "#bf8700" : "#b00020")
    : (pct >= 80 ? "#1a7f37" : pct >= 60 ? "#0969da" : pct >= 40 ? "#bf8700" : "#888")

  const wrap = el("div", { class: "eri-bar-row" })

  const labels = el("div", { class: "eri-bar-labels" })
  labels.appendChild(el("span", { class: "eri-bar-en" }, meta.en))
  labels.appendChild(arSpan(meta.ar))
  wrap.appendChild(labels)

  const right = el("div", { class: "eri-bar-right" })
  const track = el("div", { class: "eri-bar-track" })
  const fill  = el("div", {
    class: "eri-bar-fill",
    style: `width:${meta.invert ? (100 - pct) : pct}%;background:${barColor}`,
  })
  track.appendChild(fill)

  const val = el("div", { class: "eri-bar-val", style: `color:${barColor}` }, displayVal)
  right.appendChild(track)
  right.appendChild(val)
  wrap.appendChild(right)

  return wrap
}

// ── SVG Trend chart ───────────────────────────────────────────────────────────

function buildTrendChart(trend) {
  const W = 340, H = 110, PAD = { top: 12, right: 20, bottom: 28, left: 32 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`)
  svg.setAttribute("width", "100%")
  svg.setAttribute("style", "max-width:340px;display:block")
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", "ERI score 6-month trend chart")

  const scores = trend.map(t => t.score)
  const minS = Math.max(0,   Math.min(...scores) - 10)
  const maxS = Math.min(100, Math.max(...scores) + 10)

  function xPos(i)   { return PAD.left + (i / (trend.length - 1)) * innerW }
  function yPos(val) { return PAD.top + innerH - ((val - minS) / (maxS - minS)) * innerH }

  // Grid lines at 25 / 50 / 75
  ;[25, 50, 75].forEach(v => {
    if (v <= maxS && v >= minS) {
      const y = yPos(v)
      const line = document.createElementNS(ns, "line")
      line.setAttribute("x1", String(PAD.left))
      line.setAttribute("x2", String(PAD.left + innerW))
      line.setAttribute("y1", String(y))
      line.setAttribute("y2", String(y))
      line.setAttribute("stroke", "#f0f0f0")
      line.setAttribute("stroke-width", "1")
      svg.appendChild(line)

      const lbl = document.createElementNS(ns, "text")
      lbl.setAttribute("x", String(PAD.left - 4))
      lbl.setAttribute("y", String(y + 4))
      lbl.setAttribute("text-anchor", "end")
      lbl.setAttribute("font-size", "9")
      lbl.setAttribute("fill", "#bbb")
      lbl.textContent = String(v)
      svg.appendChild(lbl)
    }
  })

  // Line path
  const points = trend.map((t, i) => `${xPos(i)},${yPos(t.score)}`).join(" L ")
  const path = document.createElementNS(ns, "path")
  path.setAttribute("d", `M ${points}`)
  path.setAttribute("fill", "none")
  path.setAttribute("stroke", "#0969da")
  path.setAttribute("stroke-width", "2")
  path.setAttribute("stroke-linejoin", "round")
  path.setAttribute("stroke-linecap", "round")
  svg.appendChild(path)

  // Area fill (gradient effect via opacity)
  const areaClose = `L ${xPos(trend.length - 1)},${yPos(minS)} L ${xPos(0)},${yPos(minS)} Z`
  const area = document.createElementNS(ns, "path")
  area.setAttribute("d", `M ${points} ${areaClose}`)
  area.setAttribute("fill", "#0969da18")
  svg.appendChild(area)

  // Data points + x-labels
  trend.forEach((t, i) => {
    const cx = xPos(i)
    const cy = yPos(t.score)

    const dot = document.createElementNS(ns, "circle")
    dot.setAttribute("cx", String(cx))
    dot.setAttribute("cy", String(cy))
    dot.setAttribute("r", "3.5")
    dot.setAttribute("fill", "#0969da")
    dot.setAttribute("stroke", "#fff")
    dot.setAttribute("stroke-width", "1.5")
    svg.appendChild(dot)

    // Score label above dot
    const scoreLbl = document.createElementNS(ns, "text")
    scoreLbl.setAttribute("x", String(cx))
    scoreLbl.setAttribute("y", String(cy - 6))
    scoreLbl.setAttribute("text-anchor", "middle")
    scoreLbl.setAttribute("font-size", "9")
    scoreLbl.setAttribute("font-weight", "600")
    scoreLbl.setAttribute("fill", "#0969da")
    scoreLbl.textContent = String(t.score)
    svg.appendChild(scoreLbl)

    // Month label
    const monthLbl = document.createElementNS(ns, "text")
    monthLbl.setAttribute("x", String(cx))
    monthLbl.setAttribute("y", String(H - PAD.bottom + 11))
    monthLbl.setAttribute("text-anchor", "middle")
    monthLbl.setAttribute("font-size", "9")
    monthLbl.setAttribute("fill", "#999")
    monthLbl.textContent = t.month.split(" ")[0]   // "Jan", "Feb", …
    svg.appendChild(monthLbl)
  })

  return svg
}

// ── Employer summary card ─────────────────────────────────────────────────────

function buildEmployerSummaryCard(summary) {
  const card = el("div", { class: "eri-employer-card", role: "region", "aria-label": "Employer summary" })

  const heading = el("div", { class: "eri-employer-card__heading" })
  heading.appendChild(el("span", {}, "Employer View "))
  heading.appendChild(arSpan("/ عرض صاحب العمل"))
  card.appendChild(heading)

  const scoreRow = el("div", { class: "eri-employer-card__score-row" })
  const scoreVal = el("div", {
    class: "eri-employer-card__score",
    style: `color:${summary.interpretation.color}`,
  }, String(summary.eri_score))
  const scoreLabel = el("div", { class: "eri-employer-card__label" })
  scoreLabel.appendChild(el("div", {}, summary.interpretation.label))
  scoreLabel.appendChild(arSpan(summary.interpretation.label_ar))
  scoreRow.appendChild(scoreVal)
  scoreRow.appendChild(scoreLabel)
  card.appendChild(scoreRow)

  const signalsLabel = el("div", { class: "eri-employer-card__signals-label" }, "Top signals / أهم المؤشرات")
  card.appendChild(signalsLabel)

  const signals = el("div", { class: "eri-employer-card__signals" })
  summary.top_signals.forEach(s => {
    const meta = COMPONENT_META[s.signal] || {}
    const chip = el("div", { class: "eri-employer-card__signal-chip" })
    chip.appendChild(el("span", {}, meta.en || s.signal))
    chip.appendChild(arSpan(meta.ar || ""))
    chip.appendChild(el("span", { class: "eri-employer-card__signal-val" }, `+${s.contribution}`))
    signals.appendChild(chip)
  })
  card.appendChild(signals)

  if (summary.earned_badges && summary.earned_badges.length) {
    const badgesRow = el("div", { class: "eri-employer-card__badges" })
    summary.earned_badges.forEach(bid => {
      badgesRow.appendChild(el("span", { class: "eri-badge eri-badge--compact", title: bid }, bid.replace(/_/g, " ")))
    })
    card.appendChild(badgesRow)
  }

  return card
}

// ── Main render ───────────────────────────────────────────────────────────────

export default {
  render(container) {
    container.innerHTML = ""

    const title = el("div", { class: "page-title" })
    title.appendChild(el("span", {}, "Work Identity / ERI Score "))
    title.appendChild(arSpan("/ الهوية المهنية ومؤشر السمعة"))
    container.appendChild(title)

    // Worker selector
    const selectorWrap = el("div", { class: "eri-selector-wrap" })
    const selectorLabel = el("label", { class: "eri-selector-label", for: "eri-worker-select" })
    selectorLabel.appendChild(el("span", {}, "Worker profile "))
    selectorLabel.appendChild(arSpan("/ ملف العامل"))
    const workerSelect = el("select", { id: "eri-worker-select", class: "eri-selector" })
    const loadingOpt = el("option", { value: "" }, "Loading workers…")
    workerSelect.appendChild(loadingOpt)
    selectorWrap.appendChild(selectorLabel)
    selectorWrap.appendChild(workerSelect)
    container.appendChild(selectorWrap)

    // Content area (populated after worker selection)
    const contentArea = el("div", { class: "eri-content", "aria-live": "polite", "aria-atomic": "false" })
    container.appendChild(contentArea)

    // ── Load worker list ─────────────────────────────────────────────────────

    apiGet("/api/identity/workers")
      .then(workers => {
        workerSelect.innerHTML = ""
        if (!workers || !workers.length) {
          workerSelect.appendChild(el("option", { value: "" }, "No workers available"))
          return
        }
        workers.forEach(w => {
          const opt = el("option", { value: w.worker_id }, w.display_name || w.worker_id)
          workerSelect.appendChild(opt)
        })
        // Load first worker immediately
        if (workers.length) loadWorker(workers[0].worker_id)
      })
      .catch(e => {
        workerSelect.innerHTML = ""
        workerSelect.appendChild(el("option", { value: "" }, "Failed to load workers"))
        contentArea.innerHTML = `<div class="page-err">Failed to load worker list: ${String(e && e.message ? e.message : e)}</div>`
      })

    workerSelect.addEventListener("change", () => {
      if (workerSelect.value) loadWorker(workerSelect.value)
    })

    // ── Load and render a worker's full identity profile ─────────────────────

    function loadWorker(workerId) {
      contentArea.innerHTML = '<div class="page-load">Loading profile…</div>'

      Promise.all([
        apiGet(`/api/identity/${encodeURIComponent(workerId)}/profile`),
        apiGet(`/api/identity/${encodeURIComponent(workerId)}/employer-summary`),
      ])
        .then(([profile, summary]) => renderProfile(profile, summary))
        .catch(e => {
          contentArea.innerHTML = `<div class="page-err">Failed to load profile: ${String(e && e.message ? e.message : e)}</div>`
        })
    }

    // ── Render profile ───────────────────────────────────────────────────────

    function renderProfile(profile, summary) {
      contentArea.innerHTML = ""

      const eri    = profile.eri
      const color  = eri.interpretation.color

      // ── Top row: gauge + interpretation ──────────────────────────────────
      const heroRow = el("div", { class: "eri-hero" })

      const gaugeWrap = el("div", { class: "eri-gauge-wrap" })
      gaugeWrap.appendChild(buildGauge(eri.score, color))

      const interpWrap = el("div", { class: "eri-interp" })
      const interpLabel = el("div", { class: "eri-interp__label", style: `color:${color}` },
        eri.interpretation.label)
      const interpLabelAr = el("div", { class: "eri-interp__label-ar", dir: "rtl", lang: "ar", style: `color:${color}` },
        eri.interpretation.label_ar)
      const interpWorker = el("div", { class: "eri-interp__worker" }, profile.display_name)

      // Share link
      const shareUrl = `${window.location.origin}${window.location.pathname}#identity?worker=${profile.worker_id}&share=${profile.share_token}`
      const shareRow = el("div", { class: "eri-share" })
      const shareBtn = el("button", { class: "btn", style: "font-size:12px;padding:6px 10px" },
        "Copy profile link / نسخ رابط الملف")
      shareBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
          shareBtn.textContent = "Copied! / تم النسخ"
          setTimeout(() => { shareBtn.textContent = "Copy profile link / نسخ رابط الملف" }, 2000)
        }).catch(() => {
          shareBtn.textContent = shareUrl
        })
      })
      shareRow.appendChild(shareBtn)

      interpWrap.appendChild(interpLabel)
      interpWrap.appendChild(interpLabelAr)
      interpWrap.appendChild(interpWorker)
      interpWrap.appendChild(shareRow)

      heroRow.appendChild(gaugeWrap)
      heroRow.appendChild(interpWrap)
      contentArea.appendChild(heroRow)

      // ── Score components ──────────────────────────────────────────────────
      const compSection = el("section", { class: "eri-section", "aria-labelledby": "eri-comp-heading" })
      const compHeading = el("div", { class: "eri-section-heading", id: "eri-comp-heading" })
      compHeading.appendChild(el("span", {}, "Score components "))
      compHeading.appendChild(arSpan("/ مكونات الدرجة"))
      compSection.appendChild(compHeading)

      Object.entries(COMPONENT_META).forEach(([key, meta]) => {
        compSection.appendChild(buildComponentBar(key, profile.components[key], meta))
      })
      contentArea.appendChild(compSection)

      // ── Earned badges / tokens ────────────────────────────────────────────
      const badgeSection = el("section", { class: "eri-section", "aria-labelledby": "eri-badges-heading" })
      const badgeHeading = el("div", { class: "eri-section-heading", id: "eri-badges-heading" })
      badgeHeading.appendChild(el("span", {}, "Earned badges "))
      badgeHeading.appendChild(arSpan("/ الشارات المكتسبة"))
      badgeSection.appendChild(badgeHeading)

      if (profile.badges.length === 0) {
        badgeSection.appendChild(el("div", { style: "color:#888;font-size:13px;font-style:italic" },
          "No badges earned yet. Complete more verified projects to earn badges."))
      } else {
        const badgeGrid = el("div", { class: "eri-badge-grid" })
        profile.badges.forEach(b => {
          const badge = el("div", { class: "eri-badge" })
          const icon  = el("div", { class: "eri-badge__icon", "aria-hidden": "true" }, b.icon)
          const text  = el("div", { class: "eri-badge__text" })
          text.appendChild(el("div", { class: "eri-badge__label" }, b.label))
          text.appendChild(arSpan(b.label_ar))
          badge.appendChild(icon)
          badge.appendChild(text)
          badgeGrid.appendChild(badge)
        })
        badgeSection.appendChild(badgeGrid)
      }
      contentArea.appendChild(badgeSection)

      // ── 6-month ERI trend ─────────────────────────────────────────────────
      const trendSection = el("section", { class: "eri-section", "aria-labelledby": "eri-trend-heading" })
      const trendHeading = el("div", { class: "eri-section-heading", id: "eri-trend-heading" })
      trendHeading.appendChild(el("span", {}, "ERI trend (6 months) "))
      trendHeading.appendChild(arSpan("/ اتجاه المؤشر (٦ أشهر)"))
      trendSection.appendChild(trendHeading)
      trendSection.appendChild(buildTrendChart(profile.trend))
      contentArea.appendChild(trendSection)

      // ── Verified project history ──────────────────────────────────────────
      const projectSection = el("section", { class: "eri-section", "aria-labelledby": "eri-projects-heading" })
      const projectHeading = el("div", { class: "eri-section-heading", id: "eri-projects-heading" })
      projectHeading.appendChild(el("span", {}, "Verified project history "))
      projectHeading.appendChild(arSpan("/ سجل المشاريع الموثق"))
      projectSection.appendChild(projectHeading)

      if (!profile.projects || !profile.projects.length) {
        projectSection.appendChild(el("div", { style: "color:#888;font-size:13px" }, "No projects on record."))
      } else {
        const projectList = el("div", { class: "eri-project-list" })
        profile.projects.forEach(p => {
          const row = el("div", { class: "eri-project-row" })

          const info = el("div", { class: "eri-project-info" })
          const titleRow = el("div", { class: "eri-project-title" })
          titleRow.appendChild(el("span", {}, p.title))

          if (p.verified) {
            const vBadge = el("span", {
              class: "eri-verified-badge",
              title: "Verified by WorkCaptain",
              role: "img",
              "aria-label": "Verified",
            }, "✓ Verified")
            titleRow.appendChild(vBadge)
          }
          info.appendChild(titleRow)
          const meta = el("div", { class: "eri-project-meta" })
          meta.appendChild(el("span", {}, p.client || "—"))
          if (p.completed_at) {
            meta.appendChild(el("span", { style: "margin-inline-start:12px;color:#999" }, p.completed_at))
          }
          info.appendChild(meta)
          row.appendChild(info)

          if (p.rating) {
            const stars = el("div", { class: "eri-project-stars", "aria-label": `Rating: ${p.rating} out of 5` })
            for (let i = 1; i <= 5; i++) {
              stars.appendChild(el("span", {
                class: "eri-star" + (i <= p.rating ? " eri-star--filled" : ""),
                "aria-hidden": "true",
              }, "★"))
            }
            row.appendChild(stars)
          }

          projectList.appendChild(row)
        })
        projectSection.appendChild(projectList)
      }
      contentArea.appendChild(projectSection)

      // ── Employer summary card ─────────────────────────────────────────────
      contentArea.appendChild(buildEmployerSummaryCard(summary))
    }
  }
}
