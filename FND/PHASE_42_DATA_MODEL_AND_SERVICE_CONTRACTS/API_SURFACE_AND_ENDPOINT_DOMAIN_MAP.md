# API SURFACE AND ENDPOINT DOMAIN MAP

## Purpose

This document defines the API surface and endpoint domain map for the governed application.

## API Principle

The API surface must expose governed capabilities, not raw storage access.

Every endpoint family must remain compatible with:

- authority rules
- lifecycle rules
- invalidity rules
- escalation rules
- disclosure rules
- evidence rules

## Required API Domains

The API surface must support at minimum:

1. identity / session / role endpoints
2. intake / qualification / routing endpoints
3. opportunity / deal / pipeline endpoints
4. portfolio command / synchronization endpoints
5. allocation / scenario / reserve endpoints
6. assurance / disclosure / certification endpoints
7. accountability / remediation / sanction endpoints
8. entity / federation / alignment endpoints

## Endpoint Outputs

Each endpoint domain must define:

- endpoint family purpose
- supported actors
- governed objects touched
- allowed actions
- blocking / invalidity conditions
- escalation-sensitive actions
- audit requirements

## API Rule

No API endpoint may expose a materially valid transition unless the same transition is valid in the institutional action model.

## Outcome

The API surface map becomes the reference for implementation-ready backend interface design.
