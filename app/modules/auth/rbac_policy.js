'use strict'

/**
 * S40-G3: RBAC permission policy.
 *
 * Routes declare a required permission, not a role.
 * Roles map to permission sets. This decouples route
 * code from role definitions — new roles or permission
 * changes happen here, not across route files.
 */

const PERMISSIONS = {
  // Read-only views
  VIEW_DASHBOARD:      'VIEW_DASHBOARD',
  VIEW_WORKERS:        'VIEW_WORKERS',
  VIEW_COMPLIANCE:     'VIEW_COMPLIANCE',
  VIEW_AI:             'VIEW_AI',
  VIEW_EVIDENCE:       'VIEW_EVIDENCE',
  VIEW_PAYMENTS:       'VIEW_PAYMENTS',
  VIEW_ESB:            'VIEW_ESB',
  VIEW_REPORTS:        'VIEW_REPORTS',
  VIEW_TENANTS:        'VIEW_TENANTS',
  VIEW_IDENTITY:       'VIEW_IDENTITY',
  VIEW_SCHEDULER:      'VIEW_SCHEDULER',
  VIEW_ANALYTICS:      'VIEW_ANALYTICS',
  VIEW_SYSTEM:         'VIEW_SYSTEM',

  // Write operations
  APPROVE_AI:          'APPROVE_AI',
  CREATE_REQUISITION:  'CREATE_REQUISITION',
  MANAGE_CANDIDATES:   'MANAGE_CANDIDATES',
  MANAGE_PROBATION:    'MANAGE_PROBATION',
  APPROVE_PAYMENTS:    'APPROVE_PAYMENTS',
  APPROVE_ESB:         'APPROVE_ESB',
  MANAGE_COMPLIANCE:   'MANAGE_COMPLIANCE',
  MANAGE_EVIDENCE:     'MANAGE_EVIDENCE',
  MANAGE_SCHEDULER:    'MANAGE_SCHEDULER',
  MANAGE_TENANTS:      'MANAGE_TENANTS',
  MANAGE_PRINCIPALS:   'MANAGE_PRINCIPALS',
  MANAGE_BETA:         'MANAGE_BETA',

  // Owner-only
  DELETE_TENANT:       'DELETE_TENANT',
  MANAGE_BILLING:      'MANAGE_BILLING',

  // Seeker persona (S45)
  SEEKER_OWN_PROFILE:  'SEEKER_OWN_PROFILE',
}

const VIEW_ALL = [
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.VIEW_WORKERS,
  PERMISSIONS.VIEW_COMPLIANCE,
  PERMISSIONS.VIEW_AI,
  PERMISSIONS.VIEW_EVIDENCE,
  PERMISSIONS.VIEW_PAYMENTS,
  PERMISSIONS.VIEW_ESB,
  PERMISSIONS.VIEW_REPORTS,
  PERMISSIONS.VIEW_TENANTS,
  PERMISSIONS.VIEW_IDENTITY,
  PERMISSIONS.VIEW_SCHEDULER,
  PERMISSIONS.VIEW_ANALYTICS,
  PERMISSIONS.VIEW_SYSTEM,
]

const ROLE_PERMISSIONS = {
  OWNER: Object.values(PERMISSIONS), // all permissions

  ADMIN: Object.values(PERMISSIONS).filter(
    p => p !== PERMISSIONS.DELETE_TENANT && p !== PERMISSIONS.MANAGE_BILLING
  ),

  HIRING_MANAGER: [
    ...VIEW_ALL,
    PERMISSIONS.CREATE_REQUISITION,
    PERMISSIONS.MANAGE_CANDIDATES,
    PERMISSIONS.MANAGE_PROBATION,
    PERMISSIONS.MANAGE_EVIDENCE,
  ],

  FINANCE_APPROVER: [
    ...VIEW_ALL,
    PERMISSIONS.APPROVE_PAYMENTS,
    PERMISSIONS.APPROVE_ESB,
  ],

  VIEWER: [...VIEW_ALL],

  SEEKER: [
    PERMISSIONS.SEEKER_OWN_PROFILE,
    PERMISSIONS.VIEW_IDENTITY,
    PERMISSIONS.VIEW_PAYMENTS,
  ],
}

// Pre-compute Sets for O(1) lookup
const _roleSets = {}
for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
  _roleSets[role] = new Set(perms)
}

/**
 * Check if a role has a specific permission.
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  const s = _roleSets[role]
  if (!s) return false
  return s.has(permission)
}

/**
 * Get all permissions for a role.
 * @param {string} role
 * @returns {string[]}
 */
function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Get all valid role names.
 * @returns {string[]}
 */
function getRoles() {
  return Object.keys(ROLE_PERMISSIONS)
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, getPermissions, getRoles }
