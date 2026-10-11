import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  Clock,
  Brain,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { RISK_LEVELS } from "@/lib/mock-data"
import { RiskLevelBadge } from "@/components/ui/risk-level-badge"
import { AISummaryModal } from "@/components/ui/ai-summary-modal"
import { useSession } from "@/lib/session-context"
import { fetchRiskAssessments } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

const selectClassName =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function formatDate(dateString) {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatIP(ip) {
  return ip || "Unknown"
}

function getUserAgentShort(ua) {
  if (!ua) return "Unknown"
  if (ua.includes("curl")) return "curl"
  if (ua.includes("Chrome")) return "Chrome"
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Safari")) return "Safari"
  if (ua.includes("Android")) return "Android"
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS"
  return "Other"
}

export function Dashboard() {
  const navigate = useNavigate()
  const { session } = useSession()
  const accessToken = session?.access_token

  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [totalPages, setTotalPages] = useState(0)

  const [searchInput, setSearchInput] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false)
  const [selectedAssessment, setSelectedAssessment] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput)
      setCurrentPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  const loadAssessments = useCallback(
    (token) =>
      fetchRiskAssessments(
        {
          risk_level: riskFilter,
          action: actionFilter,
          date_from: dateFrom,
          date_to: dateTo,
          search: searchTerm,
          page: currentPage,
          limit: pageSize,
        },
        token
      ),
    [riskFilter, actionFilter, dateFrom, dateTo, searchTerm, currentPage, pageSize]
  )

  const fetchData = useCallback(async (silent = false) => {
    if (!accessToken) {
      if (!silent) {
        setError("No access token available")
        setLoading(false)
      }
      return
    }

    if (!silent) {
      setLoading(true)
      setError(null)
    }

    const applyResult = (result) => {
      setAssessments(result.data ?? [])
      setTotalCount(result.total ?? 0)
      setTotalPages(result.totalPages ?? 0)
      setError(null)
    }

    try {
      applyResult(await loadAssessments(accessToken))
    } catch (err) {
      if (err.status === 401) {
        const { data, error: refreshError } = await supabase.auth.refreshSession()
        const refreshedToken = data?.session?.access_token
        if (!refreshError && refreshedToken) {
          try {
            applyResult(await loadAssessments(refreshedToken))
            return
          } catch {
            // Refreshed token was also rejected — fall through to sign-out.
          }
        }
        await supabase.auth.signOut({ scope: "local" })
        navigate("/", { replace: true })
        return
      }

      if (!silent) {
        setError(err.message)
        setAssessments([])
        setTotalCount(0)
        setTotalPages(0)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [accessToken, loadAssessments, navigate])

  useEffect(() => {
    fetchData()
    if (!accessToken) return undefined

    const interval = setInterval(() => {
      fetchData(true)
    }, 3000)

    return () => clearInterval(interval)
  }, [fetchData, accessToken])

  const handleAISummary = (assessment) => {
    setSelectedAssessment(assessment)
    setAiSummaryOpen(true)
  }

  const stats = {
    total: totalCount,
    low: assessments.filter((a) => a.risk_level === "low").length,
    review: assessments.filter((a) => a.risk_level === "review").length,
    high: assessments.filter((a) => a.risk_level === "high").length,
    critical: assessments.filter((a) => a.risk_level === "critical").length,
  }

  return (
    <div className="flex min-h-svh flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Risk Assessment Dashboard</h1>
          <p className="text-muted-foreground">Monitor authentication risk across all login attempts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/demo")}>
            Back
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedAssessment(null)
              setAiSummaryOpen(true)
            }}
          >
            <Brain className="mr-2 h-4 w-4" />
            AI Summary
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard title="Total" value={stats.total} icon={Clock} color="text-blue-500" />
        <StatCard title="Low" value={stats.low} icon={CheckCircle} color="text-green-500" />
        <StatCard title="Review" value={stats.review} icon={Info} color="text-yellow-500" />
        <StatCard title="High" value={stats.high} icon={AlertTriangle} color="text-orange-500" />
        <StatCard title="Critical" value={stats.critical} icon={XCircle} color="text-red-500" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 border rounded-lg bg-card">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Input
              placeholder="Search IP, Account ID, Attempt ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full sm:w-64"
            />
            <select
              value={riskFilter}
              onChange={(e) => {
                setRiskFilter(e.target.value)
                setCurrentPage(1)
              }}
              className={`${selectClassName} w-40`}
            >
              <option value="all">All Risks</option>
              {RISK_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setCurrentPage(1)
              }}
              className={`${selectClassName} w-36`}
            >
              <option value="all">All Actions</option>
              <option value="login">Login</option>
              <option value="signup">Signup</option>
            </select>
          </div>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onFromChange={(v) => {
              setDateFrom(v)
              setCurrentPage(1)
            }}
            onToChange={(v) => {
              setDateTo(v)
              setCurrentPage(1)
            }}
          />
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Risk</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>IP Score</TableHead>
                <TableHead>FP Score</TableHead>
                <TableHead>Path Score</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="w-40">Time</TableHead>
                <TableHead className="w-32">Device</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-muted-foreground">Loading assessments...</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {error && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-destructive">
                    Error: {error}
                    <Button variant="outline" size="sm" className="ml-2" onClick={() => fetchData()}>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && assessments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No assessments found matching your filters
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && assessments.length > 0 &&
                assessments.map((assessment) => (
                  <TableRow key={assessment.id} className="hover:bg-muted/50">
                    <TableCell>
                      <RiskLevelBadge level={assessment.risk_level} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatIP(assessment.ip_address)}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">{assessment.account_id}</TableCell>
                    <TableCell>
                      <Badge variant={assessment.action === "signup" ? "secondary" : "default"}>
                        {assessment.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{assessment.ip_location_score}</TableCell>
                    <TableCell className="font-mono">{assessment.fingerprint_score}</TableCell>
                    <TableCell className="font-mono">{assessment.path_change_score ?? "-"}</TableCell>
                    <TableCell className="font-mono font-medium">{assessment.total_score}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(assessment.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate">
                      {getUserAgentShort(assessment.user_agent)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleAISummary(assessment)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Brain className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages} · {totalCount} total
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || loading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AISummaryModal
        open={aiSummaryOpen}
        onClose={() => setAiSummaryOpen(false)}
        assessment={selectedAssessment}
      />
    </div>
  )
}

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg bg-card">
      <div className={`p-2 rounded-lg ${color}/10`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  )
}

export default Dashboard
