/**
 * cols: Array<{ key: string, label: string, mono?: boolean, render?: (val, row) => string }>
 * rows: Array<object>
 * emptyMsg: string
 */
export function renderTable(cols, rows, emptyMsg = "No records found") {
  const wrap = document.createElement("div")
  wrap.className = "table-wrap"

  const table = document.createElement("table")

  // thead
  const thead = document.createElement("thead")
  const hr = document.createElement("tr")
  cols.forEach(col => {
    const th = document.createElement("th")
    th.textContent = col.label
    hr.appendChild(th)
  })
  thead.appendChild(hr)
  table.appendChild(thead)

  // tbody
  const tbody = document.createElement("tbody")

  if (!rows || rows.length === 0) {
    const tr = document.createElement("tr")
    tr.className = "empty-row"
    const td = document.createElement("td")
    td.colSpan = cols.length
    td.textContent = emptyMsg
    tr.appendChild(td)
    tbody.appendChild(tr)
  } else {
    rows.forEach(row => {
      const tr = document.createElement("tr")
      cols.forEach(col => {
        const td = document.createElement("td")
        if (col.mono) td.className = "mono"
        const raw = row[col.key]
        if (col.render) {
          td.innerHTML = col.render(raw, row)
        } else {
          td.textContent = raw === null || raw === undefined ? "" : String(raw)
        }
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
  }

  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}
