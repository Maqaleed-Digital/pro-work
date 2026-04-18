'use strict'

const password   = require('./password_service.test')
const jwt        = require('./jwt_service.test')
const auth       = require('./auth_service.test')
const authRouter = require('./auth_router.test')
const rbac       = require('./rbac_policy.test')

async function main() {
  console.log('\n=== S40 Auth Test Suite ===\n')

  console.log('[password_service]')
  const p1 = await password.run()

  console.log('\n[jwt_service]')
  const p2 = await jwt.run()

  console.log('\n[auth_service]')
  const p3 = await auth.run()

  console.log('\n[auth_router]')
  const p4 = await authRouter.run()

  console.log('\n[rbac_policy]')
  const p5 = await rbac.run()

  const total = p1 + p2 + p3 + p4 + p5
  const expected = 9 + 13 + 23 + 25 + 35
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
