'use client'

import { useState, useEffect } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('prowork_token')
        const headers = token ? { Authorization: `Bearer ${token}` } : {}

        const [statsRes, healthRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/stats`, { headers }),
          fetch(`${API_URL}/api/admin/health`, { headers })
        ])

        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData.data)
        }

        if (healthRes.ok) {
          const healthData = await healthRes.json()
          setHealth(healthData.data)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">System Health</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className={`p-4 rounded ${health?.ok ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="text-sm text-gray-600">Status</div>
            <div className={`text-xl font-bold ${health?.ok ? 'text-green-600' : 'text-red-600'}`}>
              {health?.ok ? 'Healthy' : 'Unhealthy'}
            </div>
          </div>
          <div className="p-4 rounded bg-blue-50">
            <div className="text-sm text-gray-600">Version</div>
            <div className="text-xl font-bold text-blue-600">{health?.system?.version || 'N/A'}</div>
          </div>
          <div className="p-4 rounded bg-purple-50">
            <div className="text-sm text-gray-600">Uptime</div>
            <div className="text-xl font-bold text-purple-600">
              {health?.system?.uptime_s ? `${Math.floor(health.system.uptime_s / 60)}m` : 'N/A'}
            </div>
          </div>
          <div className="p-4 rounded bg-amber-50">
            <div className="text-sm text-gray-600">Workers</div>
            <div className="text-xl font-bold text-amber-600">{health?.counts?.workers || 0}</div>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm uppercase">Total Workers</h3>
            <div className="text-3xl font-bold text-gray-900 mt-2">{stats.workers?.total || 0}</div>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-blue-600">FTE: {stats.workers?.fte || 0}</span>
              <span className="text-green-600">Freelancer: {stats.workers?.freelancer || 0}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm uppercase">Evidence Events</h3>
            <div className="text-3xl font-bold text-gray-900 mt-2">{stats.evidence?.total || 0}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm uppercase">Governance</h3>
            <div className={`text-3xl font-bold mt-2 ${stats.governance?.status === 'pass' ? 'text-green-600' : 'text-red-600'}`}>
              {stats.governance?.status?.toUpperCase() || 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {stats.governance?.checks_passed}/{stats.governance?.checks_total} checks passed
            </div>
          </div>
        </div>
      )}

      {stats?.evidence?.recent && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Evidence Events</h2>
          <div className="space-y-3">
            {stats.evidence.recent.slice(0, 5).map((event, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <span className="font-medium text-gray-900">{event.action}</span>
                  <span className="text-gray-500 text-sm ml-2">{event.entity_type}</span>
                </div>
                <span className="text-gray-400 text-sm">
                  {new Date(event.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
