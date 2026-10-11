import { useState, useEffect } from "react"
import { Dialog } from "radix-ui"
import { X, Brain, Loader2, CheckCircle, AlertTriangle, Info, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RiskLevelBadge } from "@/components/ui/risk-level-badge"

const RISK_ICONS = {
  low: CheckCircle,
  review: Info,
  high: AlertTriangle,
  critical: XCircle,
}

const MOCK_AI_SUMMARIES = {
  low: "This login attempt shows minimal risk. The IP location matches the user's typical geographic pattern, and the device fingerprint matches a previously trusted device. No anomalous signals were detected. This appears to be a legitimate user login from a known device and location.",
  review: "This login attempt warrants review. The IP location shows a moderate deviation from the user's typical pattern (different city/region), but the device fingerprint matches a known device. The combined score suggests this could be legitimate travel or a shared account. Consider requesting MFA for verification.",
  high: "This login attempt shows elevated risk. Significant geographic anomaly detected - the login originated from a location inconsistent with the user's recent history, implying implausible travel. The device fingerprint does not match any known trusted device. Strong recommendation to require MFA and flag for security review.",
  critical: "This login attempt poses critical risk. Multiple severe anomalies detected: extreme geographic deviation suggesting impossible travel, unknown device fingerprint matching no previous devices, and suspicious user agent (likely automated). This should be blocked immediately and the account secured. Potential account takeover attempt.",
}

function generateMockSummary(assessment) {
  if (!assessment) {
    return "Select a login attempt from the table to generate a risk summary for that event."
  }

  const baseSummary = MOCK_AI_SUMMARIES[assessment.risk_level] || MOCK_AI_SUMMARIES.review
  const details = [
    `IP Location Score: ${assessment.ip_location_score}/100`,
    `Fingerprint Score: ${assessment.fingerprint_score}/100`,
    `Path Change Score: ${assessment.path_change_score ?? 'N/A'}/100`,
    `Total Score: ${assessment.total_score}/100`,
    `Action: ${assessment.action}`,
    `IP: ${assessment.ip_address}`,
    `Time: ${new Date(assessment.created_at).toLocaleString()}`,
  ].join('\n')
  
  return `${baseSummary}\n\n---\nAssessment Details:\n${details}`
}

export function AISummaryModal({ open, onClose, assessment }) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setSummary('')
    setCopied(false)

    const timer = setTimeout(() => {
      setSummary(generateMockSummary(assessment))
      setLoading(false)
    }, 800)

    return () => clearTimeout(timer)
  }, [open, assessment])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Risk Summary
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          {assessment && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">Risk Level:</span>
              <RiskLevelBadge level={assessment.risk_level} />
              <span className="text-sm text-muted-foreground ml-auto">Attempt: {assessment.login_attempt_id?.slice(0, 8)}...</span>
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Generating AI summary...</span>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-sm text-foreground bg-muted p-4 rounded-lg border max-h-[40vh] overflow-y-auto">
                {summary || 'No summary available'}
              </pre>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={handleCopy} disabled={loading || !summary}>
              {copied ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <span className="mr-2">📋</span>
                  Copy Summary
                </>
              )}
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}