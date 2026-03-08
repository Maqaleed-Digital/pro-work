'use client'

import { useState, useEffect } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010'

export default function TrustExplorer() {
  const [reserveStatus, setReserveStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`${API_URL}/api/reserve/status`)
        if (res.ok) {
          const data = await res.json()
          setReserveStatus(data.data)
        }
      } catch (err) {
        console.error('Failed to fetch reserve status:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-blue-400 text-xl">Loading Trust Network...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Trust Network Explorer
        </h1>
        <p className="text-gray-400 mt-2">Real-time visibility into the ProWork trust infrastructure</p>
      </header>

      <div className="grid grid-cols-2 gap-8">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">Stability Buffer</h2>
          {reserveStatus?.buffer && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Status</span>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  reserveStatus.buffer.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                  reserveStatus.buffer.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {reserveStatus.buffer.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Level</span>
                <span className="font-mono">{reserveStatus.buffer.level?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Capacity</span>
                <span className="font-mono">{reserveStatus.buffer.capacity?.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    reserveStatus.buffer.status === 'healthy' ? 'bg-green-500' :
                    reserveStatus.buffer.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${(reserveStatus.buffer.ratio || 0) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-purple-400">Confidence Oracle</h2>
          {reserveStatus?.oracle && (
            <div className="space-y-4">
              <div className="text-center py-6">
                <div className="text-6xl font-bold text-purple-400">
                  {((reserveStatus.oracle.confidence || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-gray-400 mt-2">Network Confidence</div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Signals</span>
                <span className="font-mono">{reserveStatus.oracle.total_signals || 0}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-amber-400">Reputation Shock Absorber</h2>
          {reserveStatus?.absorber && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Entities Protected</span>
                <span className="font-mono text-2xl">{reserveStatus.absorber.entity_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Shocks Absorbed</span>
                <span className="font-mono text-2xl">{reserveStatus.absorber.total_shocks || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Damping Factor</span>
                <span className="font-mono">{reserveStatus.absorber.damping_factor || 0}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-green-400">Audit Proofs</h2>
          {reserveStatus?.audit && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Proofs</span>
                <span className="font-mono text-2xl">{reserveStatus.audit.total_proofs || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Verifications</span>
                <span className="font-mono text-2xl">{reserveStatus.audit.total_verifications || 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-12 text-center text-gray-500 text-sm">
        Last updated: {reserveStatus?.timestamp ? new Date(reserveStatus.timestamp).toLocaleString() : 'N/A'}
      </footer>
    </div>
  )
}
