function ensureRoot() {
  let root = document.getElementById("toast-root")
  if (!root) {
    root = document.createElement("div")
    root.id = "toast-root"
    document.body.appendChild(root)
  }
  return root
}

function show(msg, type, ms = 3500) {
  const root = ensureRoot()
  const el = document.createElement("div")
  el.className = "toast " + type
  el.textContent = String(msg || "")
  root.appendChild(el)
  setTimeout(() => { el.remove() }, ms)
}

export const toast = {
  ok:  (msg) => show(msg, "ok"),
  err: (msg) => show(msg, "err", 5000),
}
