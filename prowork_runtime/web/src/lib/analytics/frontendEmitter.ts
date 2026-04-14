import { writeFrontendEvent } from './bigqueryEventWriter'

export async function emitFrontendPageView(params: {
  route: string
  sessionId?: string | null
  actorId?: string | null
}): Promise<void> {
  await writeFrontendEvent({
    event_name: 'page_view',
    event_family: 'frontend',
    event_version: '1.0',
    occurred_at: new Date().toISOString(),
    source_layer: 'frontend',
    actor_type: params.actorId ? 'human' : 'anonymous',
    actor_id: params.actorId ?? null,
    session_id: params.sessionId ?? null,
    route: params.route,
    metadata: {}
  })
}
