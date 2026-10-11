import * as React from "react"
import { cn } from "cn"
import { Calendar as CalendarIcon } from "lucide-react"
import { Input } from "@/components/ui/input"

export function DateRangePicker({ 
  from, 
  to, 
  onFromChange, 
  onToChange, 
  placeholder = "Date range",
  className 
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={from || ""}
          onChange={(e) => onFromChange(e.target.value)}
          placeholder="From"
          className="pl-9 w-40"
        />
      </div>
      <span className="text-muted-foreground">to</span>
      <div className="relative">
        <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={to || ""}
          onChange={(e) => onToChange(e.target.value)}
          placeholder="To"
          className="pl-9 w-40"
        />
      </div>
    </div>
  )
}