import { useEffect, useState } from "react"
import { SessionContext } from "@/lib/session-context"
import { supabase } from "@/lib/supabase"

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <SessionContext.Provider
      value={{ session, user: session?.user ?? null, loading }}
    >
      {children}
    </SessionContext.Provider>
  )
}
