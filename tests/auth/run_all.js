'use strict'

const password = require('./password_service.test')
const jwt      = require('./jwt_service.test')
const auth     = require('./auth_service.test')

async function main() {
  console.log('\n=== S40-G1 Auth Test Suite ===\n')

  console.log('[password_service]')
  const p1 = await password.run()

  console.log('\n[jwt_service]')
  const p2 = await jwt.run()

  console.log('\n[auth_service]')
  const p3 = await auth.run()

  const total = p1 + p2 + p3
  const expected = 9 + 13 + 23
  console.log(`\n=== Total: ${total}/${expected} passed ===`)

  if (total < expected) {
    console.log('FAIL')
    process.exit(1)
  }
  console.log('ALL PASS')
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
