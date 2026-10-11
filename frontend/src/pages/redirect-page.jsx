import { useEffect, useRef, useState } from "react"
import { collectFingerprint } from "@/lib/fingerprint"

export default function RedirectPage({ data }) {
  const hasStarted = useRef(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!data || hasStarted.current) return

    hasStarted.current = true
    void collectFingerprint()
      .then((longLink) => window.location.replace(longLink))
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "This link could not be opened.",
        )
      })
  }, [data])

  return (
    <main className="flex min-h-svh items-center justify-center px-4 text-sm text-muted-foreground">
      <p role={error ? "alert" : "status"}>
        {error || (data ? "Redirecting…" : "This link could not be opened.")}
      </p>
    </main>
  )
}
