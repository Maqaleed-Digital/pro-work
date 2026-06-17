'use strict'

const password   = require('./password_service.test')
const jwt        = require('./jwt_service.test')
const auth       = require('./auth_service.test')
const authRouter = require('./auth_router.test')
const rbac       = require('./rbac_policy.test')
const invitation = require('./invitation_service.test')
const invoiceRouter = require('../invoices/invoice_router.test')

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

  console.log('\n[invitation_service]')
  const p6 = await invitation.run()

  console.log('\n[invoice_router]')
  const p7 = await invoiceRouter.run()

  const total = p1 + p2 + p3 + p4 + p5 + p6 + p7
  const expected = 9 + 13 + 23 + 28 + 35 + 27 + 13
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
