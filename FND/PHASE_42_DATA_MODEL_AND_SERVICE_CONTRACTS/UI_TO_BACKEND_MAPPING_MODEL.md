# UI TO BACKEND MAPPING MODEL

## Purpose

This document defines the mapping model between governed UI surfaces and backend service / object contracts.

## Mapping Principle

Every UI surface must map to governed objects, governed actions, governed endpoints, and governed invalidity states.

The UI must never invent action semantics that do not exist in the backend contract layer.

## Mapping Domains

The mapping model must support at minimum:

1. Command Center to command / allocation / intervention services
2. Board and Assurance to assurance / certification / disclosure services
3. Pipeline and Intake to intake / opportunity / deal services
4. Allocation and Resilience to scenario / reserve / reallocation services
5. Federation and Entities to entity / federation / synchronization services
6. Accountability and Recovery to accountability / remediation / sanction services
7. Doctrine and Certification to closure / readiness / trust-seal services

## Mapping Outputs

Each UI surface mapping must define:

- surface name
- primary objects rendered
- primary actions triggered
- endpoint families required
- role constraints
- blocking / invalidity states
- audit and event outputs

## Mapping Rule

No surface is implementation-ready until its governed objects, governed actions, endpoint families, and invalidity states are mapped.

## Outcome

The UI-to-backend mapping model becomes the direct bridge from product surface design into build execution.
