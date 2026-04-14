import { BigQuery } from '@google-cloud/bigquery'

export type AnalyticsSourceLayer = 'frontend' | 'platform'

export interface AnalyticsEventRow {
  event_name: string
  event_family: string
  event_version: string
  occurred_at: string
  source_layer: AnalyticsSourceLayer
  actor_type?: string | null
  actor_id?: string | null
  session_id?: string | null
  route?: string | null
  correlation_id?: string | null
  entity_type?: string | null
  entity_id?: string | null
  status?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function dataset() {
  const projectId = requiredEnv('WORKCAPTAIN_BQ_PROJECT_ID')
  const datasetId = requiredEnv('WORKCAPTAIN_BQ_DATASET')
  return new BigQuery({ projectId }).dataset(datasetId)
}

function serializeRow(row: AnalyticsEventRow): Record<string, unknown> {
  const { metadata, ...rest } = row
  return {
    ...rest,
    metadata: JSON.stringify(metadata ?? {}),
  }
}

export async function writeFrontendEvent(row: AnalyticsEventRow): Promise<void> {
  await dataset().table('raw_frontend_events').insert([serializeRow(row)])
}

export async function writePlatformEvent(row: AnalyticsEventRow): Promise<void> {
  await dataset().table('raw_platform_events').insert([serializeRow(row)])
}
