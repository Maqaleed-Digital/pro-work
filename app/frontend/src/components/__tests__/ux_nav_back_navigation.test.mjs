// WC-UX-NAV-001 — admin back-navigation must not fall through to the JSON-404 apex.
//
// The defect: assigning `location.hash` PUSHES a history entry. Entering /admin
// without a token pushed #register, and register.js then pushed #request-access on
// top. Pressing Back re-entered the redirect stub, which redirected again — a bounce.
// Escaping that bounce by mashing Back is what carried visitors past /admin onto
// workcaptain.ai/, whose governed response is a JSON 404.
//
// The fix is replace-not-push on every REDIRECT. These tests assert the property that
// actually matters: entering the controlled-beta surface costs ZERO history entries,
// so Back leads where the visitor came from rather than into a redirect loop.
//
// The intentionally non-public apex is NOT changed by any of this, and Suite 3
// asserts that no source in this change touches it.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC  = path.join(HERE, '..', '..')
const read = p => fs.readFileSync(path.join(SRC, p), 'utf8')

const MAIN     = read('main.js')
const REGISTER = read('pages/register.js')
const ROUTER   = read('router.js')

// ── A tiny history model: push grows the stack, replace swaps the top ─────────
function makeWindow(initialHash = '') {
  const stack = [{ hash: initialHash }]
  const win = {
    location: {
      get hash() { return stack[stack.length - 1].hash },
      // Assigning location.hash is a PUSH — this is the browser behaviour the
      // defect depended on, modelled faithfully so the test can detect a regression.
      set hash(v) { stack.push({ hash: v.startsWith('#') ? v : '#' + v }) },
      reload() { win.reloaded = true },
    },
    history: {
      replaceState(_s, _t, url) { stack[stack.length - 1] = { hash: url } },
    },
    __pwNavigate() {},
    reloaded: false,
    stack,
  }
  return win
}

describe('Suite 1: the history model itself distinguishes push from replace', () => {
  it('assigning location.hash grows the stack (push)', () => {
    const w = makeWindow('')
    w.location.hash = 'register'
    assert.equal(w.stack.length, 2, 'hash assignment must model a PUSH')
  })

  it('replaceState swaps the top entry (no growth)', () => {
    const w = makeWindow('')
    w.history.replaceState(null, '', '#register')
    assert.equal(w.stack.length, 1, 'replaceState must not grow the stack')
    assert.equal(w.stack[0].hash, '#register')
  })
})

describe('Suite 2: the register redirect stub costs no history entry', () => {
  // Executes the stub's real redirect block against the history model.
  function runRegisterRedirect(win) {
    if (win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', '#request-access')
      if (typeof win.__pwNavigate === 'function') win.__pwNavigate('request-access', false)
    } else {
      win.location.hash = 'request-access'
    }
  }

  it('redirecting #register -> #request-access adds no entry', () => {
    const w = makeWindow('#register')
    const before = w.stack.length
    runRegisterRedirect(w)
    assert.equal(w.stack.length, before, 'a redirect must not stack a history entry')
    assert.equal(w.location.hash, '#request-access')
  })

  it('Back from #request-access does not re-enter the redirect stub', () => {
    // Model the full no-token entry: /admin -> (replace) #register -> (replace) #request-access
    const w = makeWindow('')
    w.history.replaceState(null, '', '#register')
    runRegisterRedirect(w)
    assert.equal(w.stack.length, 1,
      'entering /admin without a token must cost ZERO history entries; ' +
      `stack grew to ${w.stack.length}`)
  })

  it('the pre-fix behaviour would have stacked entries (negative control)', () => {
    // The old code path, reproduced: two pushes, and #register left behind.
    const w = makeWindow('')
    w.location.hash = 'register'
    w.location.hash = 'request-access'
    assert.equal(w.stack.length, 3,
      'the pre-fix path MUST stack entries — otherwise Suite 2 proves nothing')
    assert.equal(w.stack[1].hash, '#register',
      'the redirect stub was left behind the visitor, which is what Back re-entered')
  })
})

describe('Suite 3: every redirect in source replaces, and the apex is untouched', () => {
  it('register.js redirect uses replaceState', () => {
    assert.match(REGISTER, /history\.replaceState\(null, "", "#request-access"\)/)
  })

  it('main.js no-token entry uses replaceState', () => {
    assert.match(MAIN, /history\.replaceState\(null, '', '#register'\)/)
  })

  it('every bare location.hash assignment is a no-replaceState fallback', () => {
    for (const [name, src] of [['main.js', MAIN], ['register.js', REGISTER]]) {
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (!/^\s*window\.location\.hash\s*=/.test(line)) return
        const preceding = lines.slice(Math.max(0, i - 4), i).join('\n')
        assert.match(preceding, /else \{/,
          `${name}:${i + 1} assigns location.hash outside a fallback branch — that is a PUSH`)
      })
    }
  })

  it('router.js exposes a replace-semantics route helper', () => {
    assert.match(ROUTER, /export function replaceRoute\(/)
    assert.match(ROUTER, /history\.replaceState/)
  })

  it('the denied-route redirect replaces rather than pushes', () => {
    const denied = ROUTER.split('canAccessRoute(front, requested)')[1] || ''
    assert.match(denied.slice(0, 600), /replaceState/,
      'a denied route is a redirect — Back must not return the user to the wall')
  })

  it('nothing in this change touches the governed apex policy', () => {
    // The apex must keep returning its JSON 404. No source here may add an apex
    // route, redirect to "/", or otherwise reach outside the hash router.
    for (const [name, src] of [['main.js', MAIN], ['register.js', REGISTER], ['router.js', ROUTER]]) {
      assert.ok(!/location\.(href|pathname)\s*=/.test(src),
        `${name} must not navigate by pathname — the apex policy is out of scope here`)
      assert.ok(!/replaceState\([^)]*['"]\/['"]\s*\)/.test(src),
        `${name} must not replace history to the apex path`)
    }
  })
})
