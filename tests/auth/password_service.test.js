'use strict'

const assert = require('assert')
const { hash, verify, COST_FACTOR } = require('../../app/modules/auth/password_service')

async function run() {
  let passed = 0

  // 1. hash produces a bcrypt string
  {
    const h = await hash('Str0ngP@ss!')
    assert.ok(h.startsWith('$2a$') || h.startsWith('$2b$'), 'should be bcrypt hash')
    passed++
    console.log('  ✓ hash produces bcrypt string')
  }

  // 2. cost factor is 12
  {
    assert.strictEqual(COST_FACTOR, 12)
    passed++
    console.log('  ✓ cost factor is 12')
  }

  // 3. verify returns true for correct password
  {
    const h = await hash('CorrectHorse99')
    const ok = await verify('CorrectHorse99', h)
    assert.strictEqual(ok, true)
    passed++
    console.log('  ✓ verify returns true for correct password')
  }

  // 4. verify returns false for wrong password
  {
    const h = await hash('CorrectHorse99')
    const ok = await verify('WrongHorse99', h)
    assert.strictEqual(ok, false)
    passed++
    console.log('  ✓ verify returns false for wrong password')
  }

  // 5. hash rejects empty password
  {
    try {
      await hash('')
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e.message.includes('non-empty'))
    }
    passed++
    console.log('  ✓ hash rejects empty password')
  }

  // 6. hash rejects short password
  {
    try {
      await hash('short')
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e.message.includes('at least 8'))
    }
    passed++
    console.log('  ✓ hash rejects password under 8 chars')
  }

  // 7. hash rejects password over 72 chars
  {
    try {
      await hash('a'.repeat(73))
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e.message.includes('at most 72'))
    }
    passed++
    console.log('  ✓ hash rejects password over 72 chars')
  }

  // 8. verify returns false for null inputs
  {
    const ok = await verify(null, null)
    assert.strictEqual(ok, false)
    passed++
    console.log('  ✓ verify returns false for null inputs')
  }

  // 9. same password produces different hashes (salt)
  {
    const h1 = await hash('SamePass88')
    const h2 = await hash('SamePass88')
    assert.notStrictEqual(h1, h2)
    passed++
    console.log('  ✓ same password produces different hashes (unique salt)')
  }

  console.log(`  password_service: ${passed}/9 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 9 ? 0 : 1))
}
