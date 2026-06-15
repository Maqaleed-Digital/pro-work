# WORKCAPTAIN — IDENTITY, SESSION, AND TOKEN BASELINE

Version: 1.0  
Status: ACTIVE

## 1. Purpose

This document defines the minimum truth required for auth baseline verification, independent of implementation choice.

## 2. Implementation-Agnostic Requirement

Phase 9 does not force a specific auth provider.  
It requires that implementation truthfully supports:

- authenticated caller recognition
- protected admin/operator access
- an authenticated identity/self check path
- evidence-backed route verification

## 3. Accepted Credential Forms

Allowed examples:
- bearer token
- signed session cookie
- other implementation-defined auth material

The exact mechanism may vary, but evidence must show authenticated success on protected paths.

## 4. Evidence Requirement

Evidence must record:

- unauthenticated admin check
- unauthenticated identity check
- authenticated admin check
- authenticated identity check
- public health check

## 5. Baseline Identity Contract

Authenticated identity endpoint should return enough caller identity to prove auth is active, such as:

- subject or user id
- role or access context
- implementation-defined identity payload
