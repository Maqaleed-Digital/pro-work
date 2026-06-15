// Wraps app/api/employer_onboarding_router.js
//
// Routes:
//   PATCH /api/onboarding/profile  — update tenant establishment profile
//   GET   /api/onboarding/status   — onboarding progress
//   POST  /api/auth/resend-verification  — no-op stub for beta
//
// Day 3 lean onboarding wizard maps brief §2 fields to backend schema:
//   orgName → establishment_name
//   teamSize → total_employees
//   crNumber, primary_use_case, preferred_locale, pdpl_consent → tenant.config
//
// Day 4 settings page reads the same profile to seed the edit form.

import { apiGet, apiPatch, apiPost } from "../api.js"

/**
 * Read the current tenant's onboarding state + establishment profile.
 * @returns {Promise<{
 *   completedAt: string|null,
 *   profile: {
 *     orgName: string|null,
 *     crNumber: string|null,
 *     primaryUseCase: string|null,
 *     teamSize: number|null,
 *     preferredLocale: 'en'|'ar'|null,
 *     pdplConsent: { granted: boolean, granted_at: string|null, version: string|null }|null,
 *   }
 * }>}
 */
export async function getOnboardingStatus() {
  try {
    const data = await apiGet("/api/onboarding/status")
    return normaliseStatus(data)
  } catch (e) {
    if (e && e.status === 404) {
      return { completedAt: null, profile: emptyProfile() }
    }
    throw e
  }
}

/**
 * Update the organisation profile. Pass any subset of fields; unspecified
 * fields are preserved server-side (PATCH semantics).
 *
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateOnboardingProfile(updates = {}) {
  const payload = {}
  if (updates.orgName !== undefined) payload.establishment_name = updates.orgName
  if (updates.teamSize !== undefined) payload.total_employees = updates.teamSize
  if (updates.crNumber !== undefined) payload.cr_number = updates.crNumber
  if (updates.primaryUseCase !== undefined) payload.primary_use_case = updates.primaryUseCase
  if (updates.preferredLocale !== undefined) payload.preferred_locale = updates.preferredLocale
  if (updates.pdplConsent !== undefined) payload.pdpl_consent = updates.pdplConsent
  return apiPatch("/api/onboarding/profile", payload)
}

/**
 * Trigger a re-send of the email verification link. The backend stub is
 * a no-op for the controlled-beta window; UI should not depend on this
 * for the cohort flow but it is exposed for completeness.
 */
export async function resendVerificationEmail() {
  return apiPost("/api/auth/resend-verification", {})
}

function emptyProfile() {
  return {
    orgName: null,
    crNumber: null,
    primaryUseCase: null,
    teamSize: null,
    preferredLocale: null,
    pdplConsent: null,
  }
}

function normaliseStatus(data) {
  if (!data || typeof data !== "object") return { completedAt: null, profile: emptyProfile() }
  const p = (data.profile && typeof data.profile === "object") ? data.profile : data
  return {
    completedAt: typeof data.completedAt === "string" ? data.completedAt : null,
    profile: {
      orgName: p.establishment_name || p.orgName || null,
      crNumber: p.cr_number || p.crNumber || null,
      primaryUseCase: p.primary_use_case || p.primaryUseCase || null,
      teamSize: typeof p.total_employees === "number" ? p.total_employees : (typeof p.teamSize === "number" ? p.teamSize : null),
      preferredLocale: p.preferred_locale || p.preferredLocale || null,
      pdplConsent: p.pdpl_consent || p.pdplConsent || null,
    },
  }
}
