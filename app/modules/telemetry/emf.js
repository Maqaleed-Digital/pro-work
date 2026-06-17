'use strict'

/**
 * F-06: Minimal CloudWatch EMF (Embedded Metric Format) emitter.
 *
 * CAPABILITY READINESS — NOT an observability platform.
 *
 * Writes ONE well-formed EMF JSON line to stdout. The ECS task ships stdout to
 * CloudWatch Logs (awslogs driver, group /ecs/workcaptain); CloudWatch then
 * AUTO-EXTRACTS custom metrics from any log event carrying a valid `_aws`
 * envelope. So a valid EMF line on stdout is sufficient — there is NO
 * PutMetricData, NO @aws-sdk, NO IAM, NO AWS resource creation. The custom
 * namespace materializes on the first valid EMF event.
 *
 * Reference spec:
 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 *
 * STANDALONE by design: this does NOT depend on (and must NOT be wired into)
 * app/lib/logging/logger.js, the in-memory Prometheus store, request_logger, or
 * kpi_tracker.js. It is a tiny self-contained stdout writer.
 */

const DEFAULT_NAMESPACE = 'WorkCaptain/App'
const SERVICE_NAME = process.env.SERVICE_NAME || 'workcaptain'
const ENVIRONMENT = process.env.NODE_ENV || 'development'

/**
 * Build a structurally-valid EMF envelope object.
 *
 * The returned object carries:
 *   - `_aws.Timestamp` (epoch ms)
 *   - `_aws.CloudWatchMetrics[0]` = { Namespace, Dimensions: [[...keys]], Metrics: [{ Name, Unit }] }
 *   - the metric value as a TOP-LEVEL property keyed by `name`
 *   - each dimension as a TOP-LEVEL property
 *
 * @param {Object} opts
 * @param {string} opts.name        metric name (e.g. "InvoicesIssued")
 * @param {number} opts.value       metric value (e.g. 1)
 * @param {string} [opts.unit]      CloudWatch unit (default "Count")
 * @param {string} [opts.namespace] custom namespace (default "WorkCaptain/App")
 * @param {Object} [opts.dimensions] dimension key→value map (default { service, environment })
 * @returns {Object} the EMF envelope, ready for JSON.stringify
 */
function buildEmf({ name, value, unit, namespace, dimensions } = {}) {
  if (!name || typeof name !== 'string') throw new Error('emf: metric name is required')
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('emf: metric value must be a finite number')
  }

  const dims = dimensions || { service: SERVICE_NAME, environment: ENVIRONMENT }
  const dimensionKeys = Object.keys(dims)

  const envelope = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace || DEFAULT_NAMESPACE,
          Dimensions: [dimensionKeys],
          Metrics: [{ Name: name, Unit: unit || 'Count' }],
        },
      ],
    },
  }

  // Each dimension value is a top-level property.
  for (const k of dimensionKeys) envelope[k] = String(dims[k])
  // The metric value is a top-level property keyed by the metric name.
  envelope[name] = value

  return envelope
}

/**
 * Emit ONE operational metric as a single EMF line to stdout.
 *
 * NON-BLOCKING / FAIL-SAFE: any error (build failure, stringify failure, writer
 * failure) is swallowed. Telemetry must NEVER throw into or break the caller's
 * request path. Returns true if a line was written, false otherwise.
 *
 * @param {Object} opts — see buildEmf
 * @param {Function} [write] — injectable writer (testing seam; default process.stdout.write)
 * @returns {boolean}
 */
function emitMetric(opts, write) {
  try {
    const envelope = buildEmf(opts)
    const line = JSON.stringify(envelope)
    const writer = typeof write === 'function' ? write : (s) => process.stdout.write(s)
    writer(line + '\n')
    return true
  } catch (_e) {
    // Swallow — never propagate telemetry failures to the caller.
    return false
  }
}

module.exports = { emitMetric, buildEmf, DEFAULT_NAMESPACE }
