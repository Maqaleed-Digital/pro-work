import { AsyncLocalStorage } from "node:async_hooks"

export type RequestContext = {
  requestId: string
  actorId: string
  ownerId: string
}

const storage = new AsyncLocalStorage<RequestContext>()

function genRequestId(): string {
  return `req_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function defaultActorId(): string {
  return "actor_demo"
}

function defaultOwnerId(): string {
  return "owner_demo"
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext | null {
  return storage.getStore() ?? null
}

export function resolveRequestIdFromHeaders(headerValue: unknown): string {
  if (typeof headerValue === "string" && headerValue.trim().length > 0) return headerValue.trim()
  return genRequestId()
}

export function resolveActorIdFromHeaders(headerValue: unknown): string {
  if (typeof headerValue === "string" && headerValue.trim().length > 0) return headerValue.trim()
  return defaultActorId()
}

export function resolveOwnerIdFromHeaders(headerValue: unknown): string {
  if (typeof headerValue === "string" && headerValue.trim().length > 0) return headerValue.trim()
  return defaultOwnerId()
}

