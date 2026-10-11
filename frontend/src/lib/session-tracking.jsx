import { useEffect, useRef, useState } from "react"
import { useSession } from "@/lib/session-context"
import { supabase } from "@/lib/supabase"
import { TrackingContext } from "@/lib/tracking-context"

const heartbeatIntervalMs = 10_000

function sessionStorageKey(userId) {
  return `vortexa.sessionId:${userId}`
}

function getStoredSessionId(userId) {
  if (!userId) return null
  return window.sessionStorage.getItem(sessionStorageKey(userId))
}

function createSession(userId) {
  return supabase
    .from("user_sessions")
    .insert({ user_id: userId })
    .select("id")
    .single()
    .then(({ data, error }) => {
      if (error) throw error
      return data.id
    })
}

function touchSession(sessionId) {
  return supabase
    .from("user_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("id")
    .then(({ data, error }) => {
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error("Heartbeat matched no session row (check RLS)")
      }
    })
}

function sendHeartbeat(sessionId) {
  const sentAt = new Date().toISOString()
  if (import.meta.env.DEV) {
    console.debug("[tracking] heartbeat ->", sessionId, sentAt)
  }
  return touchSession(sessionId).catch((error) => {
    console.error("Failed to update session heartbeat:", error)
  })
}

export function SessionTrackingProvider({ children }) {
  const { user } = useSession()
  const userId = user?.id ?? null

  const [createdSession, setCreatedSession] = useState(null)
  const prevUserIdRef = useRef(null)

  const sessionId =
    userId &&
    (getStoredSessionId(userId) ||
      (createdSession?.userId === userId ? createdSession.id : null))

  useEffect(() => {
    const prevUserId = prevUserIdRef.current
    prevUserIdRef.current = userId
    if (prevUserId && prevUserId !== userId) {
      window.sessionStorage.removeItem(sessionStorageKey(prevUserId))
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    if (getStoredSessionId(userId)) return
    if (createdSession?.userId === userId) return

    let active = true
    createSession(userId)
      .then((id) => {
        window.sessionStorage.setItem(sessionStorageKey(userId), id)
        if (active) setCreatedSession({ userId, id })
      })
      .catch((error) => {
        console.error("Failed to start tracking session:", error)
      })

    return () => {
      active = false
    }
  }, [userId, createdSession])

  useEffect(() => {
    if (!sessionId) return

    void sendHeartbeat(sessionId)

    const interval = window.setInterval(() => {
      void sendHeartbeat(sessionId)
    }, heartbeatIntervalMs)

    const onVisible = () => {
      if (document.visibilityState === "visible") void sendHeartbeat(sessionId)
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [sessionId])

  return (
    <TrackingContext.Provider value={{ currentSessionId: sessionId }}>
      {children}
    </TrackingContext.Provider>
  )
}
