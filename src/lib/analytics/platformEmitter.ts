import { writePlatformEvent } from './bigqueryEventWriter'

export async function emitPlatformLifecycleEvent(params: {
  eventName: string
  entityType: string
  entityId: string
  status?: string | null
  correlationId?: string | null
}): Promise<void> {
  await writePlatformEvent({
    event_name: params.eventName,
    event_family: 'platform',
    event_version: '1.0',
    occurred_at: new Date().toISOString(),
    source_layer: 'platform',
    entity_type: params.entityType,
    entity_id: params.entityId,
    status: params.status ?? null,
    correlation_id: params.correlationId ?? null,
    metadata: {}
  })
}
