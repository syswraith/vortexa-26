import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { generateFingerprints } from "@/lib/fingerprint"
import { submitAuth } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
  const location = useLocation()
  const [fingerprints, setFingerprints] = useState(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState(location.state?.notice ?? "")

  useEffect(() => {
    let active = true

    void generateFingerprints().then((result) => {
      if (active) setFingerprints(result)
    })

    return () => {
      active = false
    }
  }, [])

  const ready = fingerprints !== null
  const canSubmit = ready && email.length > 0 && password.length > 0 && !pending

  async function handleAction(action) {
    if (!canSubmit) return

    setPending(action)
    setError("")
    setNotice("")

    try {
      if (action === "create") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (signUpError) throw signUpError
        if (!data.session) {
          setNotice("Check your email to confirm your account.")
        } else if (data.session?.access_token) {
          // Report auth with access token for IP risk assessment
          void submitAuth(action, { email, password }, fingerprints, data.session.access_token).catch((reason) => {
            console.error("Failed to report auth attempt:", reason)
          })
        }
        // Sync auth.users -> public."Users" with same UUID
        if (data.user?.id) {
          const { error: usersError } = await supabase
            .from("Users")
            .insert({ uid: data.user.id, email: data.user.email })
            .select()
            .single()
          if (usersError) {
            console.warn("Could not sync user to public.Users:", usersError.message)
          }
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        
        // After successful sign in, report auth with access token for IP risk assessment
        if (data.session?.access_token) {
          void submitAuth(action, { email, password }, fingerprints, data.session.access_token).catch((reason) => {
            console.error("Failed to report auth attempt:", reason)
          })
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Something went wrong.",
      )
    } finally {
      setPending("")
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Welcome</h1>
          <p className="text-sm text-muted-foreground">
            {ready ? "Sign in or create an account." : "Preparing secure session…"}
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            disabled={!canSubmit}
            onClick={() => handleAction("login")}
          >
            {pending === "login" ? "Logging in…" : "Log in"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={!canSubmit}
            onClick={() => handleAction("create")}
          >
            {pending === "create" ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </main>
  )
}
