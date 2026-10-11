import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { useSession } from "@/lib/session-context"
import { useTracking } from "@/lib/tracking-context"
import { supabase } from "@/lib/supabase"

export function NavigationTracking() {
  const location = useLocation()
  const { user } = useSession()
  const { currentSessionId } = useTracking()
  const lastLoggedRef = useRef({ sessionId: null, path: null })

  useEffect(() => {
    if (!user || !currentSessionId) return

    const path = location.pathname
    if (
      lastLoggedRef.current.sessionId === currentSessionId &&
      lastLoggedRef.current.path === path
    )
      return
    lastLoggedRef.current = { sessionId: currentSessionId, path }

    void supabase
      .from("session_navigation_events")
      .insert({
        session_id: currentSessionId,
        user_id: user.id,
        path,
        client_timestamp: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.error("Failed to log navigation event:", error)
      })
  }, [location.pathname, user, currentSessionId])

  return null
}
