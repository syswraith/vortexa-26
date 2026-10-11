import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Brain, ChevronUp, ChevronDown, RefreshCw } from "lucide-react"
import { AISummaryModal } from "@/components/ui/ai-summary-modal"
import { RiskLevelBadge } from "@/components/ui/risk-level-badge"
import { useSession } from "@/lib/session-context"

const RISK_LEVELS = ['low', 'review', 'high', 'critical']

function formatDate(s) {
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function formatIP(ip) { return ip || 'Unknown' }
function getUAShort(ua) {
  if (!ua) return 'Unknown'
  if (ua.includes('curl')) return 'curl'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  return 'Other'
}
function scoreColor(score) {
  if (score >= 70) return 'text-red-600 bg-red-50'
  if (score >= 40) return 'text-yellow-600 bg-yellow-50'
  return 'text-green-600 bg-green-50'
}

function fetchAssessments({ queryKey, signal }) {
  const [, { filters, token }] = queryKey
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => v && params.set(k, v))
  return fetch(`/api/risk-assessments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  }).then(async r => {
    const text = await r.text()
    if (!r.ok) throw new Error(`Failed (${r.status}): ${text.slice(0, 200)}`)
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`Invalid JSON response (${r.status}): ${text.slice(0, 200)}`)
    }
  })
}

export function RiskDashboard() {
  const { session } = useSession()
  const token = session?.access_token

  const [filters, setFilters] = useState({ risk_level: '', action: '', search: '', date_from: '', date_to: '' })
  const [view, setView] = useState('table')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiAssessment, setAiAssessment] = useState(null)
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['assessments', { filters, token }],
    queryFn: fetchAssessments,
    enabled: !!token,
    placeholderData: (prev) => prev,
  })

  const assessments = data?.data || []
  const total = assessments.length

  const stats = {
    total,
    low: assessments.filter(a => a.risk_level === 'low').length,
    review: assessments.filter(a => a.risk_level === 'review').length,
    high: assessments.filter(a => a.risk_level === 'high').length,
    critical: assessments.filter(a => a.risk_level === 'critical').length,
  }

  function handleSort(key) {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const sorted = [...assessments].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key]
    if (av < bv) return sort.dir === 'asc' ? -1 : 1
    if (av > bv) return sort.dir === 'asc' ? 1 : -1
    return 0
  })

  if (!token) return <div className="p-8 text-center text-muted-foreground">Please log in</div>

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Risk Assessment Dashboard</h1>
          <p className="text-muted-foreground text-sm">Monitor authentication risk across all login attempts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView(v => v === 'table' ? 'cards' : 'table')} className="px-3 py-1.5 text-sm border rounded hover:bg-muted">
            {view === 'table' ? 'Cards' : 'Table'}
          </button>
          <button onClick={() => { setAiAssessment(null); setAiOpen(true) }} className="px-3 py-1.5 text-sm border rounded hover:bg-muted flex items-center gap-1">
            <Brain className="h-4 w-4" /> AI Summary
          </button>
          <button onClick={() => refetch()} disabled={isLoading} className="px-3 py-1.5 text-sm border rounded hover:bg-muted flex items-center gap-1">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[{k:'total',l:'Total',c:'text-blue-500'},{k:'low',l:'Low',c:'text-green-500'},{k:'review',l:'Review',c:'text-yellow-500'},{k:'high',l:'High',c:'text-orange-500'},{k:'critical',l:'Critical',c:'text-red-500'}].map(s => (
          <div key={s.k} className="flex items-center gap-3 p-4 border rounded-lg bg-card">
            <div className={`p-2 rounded-lg ${s.c}/10`}><div className={`h-5 w-5 ${s.c}`} /></div>
            <div><p className="text-sm text-muted-foreground">{s.l}</p><p className="text-2xl font-bold">{stats[s.k]}</p></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 p-4 border rounded-lg bg-card">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            placeholder="Search IP, Account ID, Attempt ID..."
            value={filters.search}
            onChange={e => setFilters(f => ({...f, search: e.target.value}))}
            className="flex-1 px-3 py-2 border rounded bg-background"
          />
          <select value={filters.risk_level} onChange={e => setFilters(f => ({...f, risk_level: e.target.value}))} className="px-3 py-2 border rounded bg-background w-40">
            <option value="">All Risks</option>
            {RISK_LEVELS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </select>
          <select value={filters.action} onChange={e => setFilters(f => ({...f, action: e.target.value}))} className="px-3 py-2 border rounded bg-background w-36">
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="signup">Signup</option>
          </select>
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({...f, date_from: e.target.value}))} className="px-3 py-2 border rounded bg-background w-40" />
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({...f, date_to: e.target.value}))} className="px-3 py-2 border rounded bg-background w-40" />
        </div>
      </div>

      {isLoading && !data && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-muted-foreground">Loading...</span>
        </div>
      )}

      {isError && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-700 rounded">
          Error: {error.message} <button onClick={() => refetch()} className="ml-2 underline">Retry</button>
        </div>
      )}

      {view === 'table' && !isLoading && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['risk_level','ip_address','account_id','action','ip_location_score','fingerprint_score','path_change_score','total_score','created_at','user_agent'].map(col => (
                  <th key={col} className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-muted" onClick={() => handleSort(col)}>
                    <div className="flex items-center gap-1">
                      {col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      {sort.key === col && (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No assessments found</td></tr>
              )}
              {sorted.map(a => (
                <tr key={a.id} className="border-t hover:bg-muted/50">
                  <td className="px-3 py-2"><RiskLevelBadge level={a.risk_level} /></td>
                  <td className="px-3 py-2 font-mono">{formatIP(a.ip_address)}</td>
                  <td className="px-3 py-2 font-mono text-xs max-w-[120px] truncate block">{a.account_id}</td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${a.action==='signup'?'bg-secondary text-secondary-foreground':'bg-primary/10 text-primary'}`}>{a.action}</span></td>
                  <td className="px-3 py-2 font-mono">{a.ip_location_score}</td>
                  <td className="px-3 py-2 font-mono">{a.fingerprint_score}</td>
                  <td className="px-3 py-2 font-mono">{a.path_change_score ?? '-'}</td>
                  <td className="px-3 py-2 font-mono font-medium">
                    <span className={`px-2 py-0.5 rounded ${scoreColor(a.total_score)}`}>{a.total_score}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(a.created_at)}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate block">{getUAShort(a.user_agent)}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => { setAiAssessment(a); setAiOpen(true) }} className="text-muted-foreground hover:text-primary p-1">
                      <Brain className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'cards' && !isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.length === 0 && <div className="col-span-full text-center py-8 text-muted-foreground">No assessments found</div>}
          {sorted.map(a => (
            <div key={a.id} className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <RiskLevelBadge level={a.risk_level} />
                <button onClick={() => { setAiAssessment(a); setAiOpen(true) }} className="text-muted-foreground hover:text-primary p-1"><Brain className="h-4 w-4" /></button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">IP</span><span className="font-mono">{formatIP(a.ip_address)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-mono text-xs truncate block max-w-[150px]">{a.account_id}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Action</span><span className={`px-2 py-0.5 rounded text-xs ${a.action==='signup'?'bg-secondary/20 text-secondary':'bg-primary/10 text-primary'}`}>{a.action}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">IP Score</span><span className="font-mono">{a.ip_location_score}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">FP Score</span><span className="font-mono">{a.fingerprint_score}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Path Score</span><span className="font-mono">{a.path_change_score ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className={`font-mono font-medium px-2 py-0.5 rounded ${scoreColor(a.total_score)}`}>{a.total_score}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Time</span><span>{formatDate(a.created_at)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Device</span><span className="truncate block max-w-[120px]">{getUAShort(a.user_agent)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AISummaryModal open={aiOpen} onClose={() => setAiOpen(false)} assessment={aiAssessment} />
    </div>
  )
}

export default RiskDashboard