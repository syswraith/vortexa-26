import { cn } from "cn"
import { CheckCircle, Info, AlertTriangle, XCircle } from "lucide-react"

const RISK_ICONS = {
  low: CheckCircle,
  review: Info,
  high: AlertTriangle,
  critical: XCircle,
}

const RISK_LABELS = {
  low: 'Low',
  review: 'Review',
  high: 'High',
  critical: 'Critical',
}

const RISK_STYLES = {
  low: 'bg-green-100 text-green-800 border-green-200',
  review: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
}

export function RiskLevelBadge({ level, showIcon = true, className }) {
  const Icon = RISK_ICONS[level] || Info
  const label = RISK_LABELS[level] || level
  const style = RISK_STYLES[level] || RISK_STYLES.review

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
      style,
      className
    )}>
      {showIcon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  )
}