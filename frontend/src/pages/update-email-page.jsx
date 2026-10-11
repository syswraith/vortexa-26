import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/session-context"
import { supabase } from "@/lib/supabase"
import { generateFingerprints } from "@/lib/fingerprint"
import { submitAuth } from "@/lib/auth"

export default function UpdateEmailPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  const [newEmail, setNewEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [fingerprints, setFingerprints] = useState(null)

  useEffect(() => {
    let active = true
    void generateFingerprints().then((result) => {
      if (active) setFingerprints(result)
    })
    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmedEmail = newEmail.trim()

    if (!trimmedEmail) {
      setError("Please enter a valid email address.")
      return
    }

    if (trimmedEmail.toLowerCase() === user?.email?.toLowerCase()) {
      setError("New email must be different from your current email.")
      return
    }

    setPending(true)
    setError("")

    if (fingerprints) {
      void submitAuth(
        "update-email",
        { email: trimmedEmail },
        fingerprints,
      ).catch((err) => {
        console.error("Failed to report auth attempt:", err)
      })
    }

    try {
      // 1. Update email in database (public."Users") and Supabase auth immediately
      const res = await fetch("/auth/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email: trimmedEmail,
        }),
      })

      const resData = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(resData?.error || "Failed to update email in database.")
      }

      // 2. Sync client session
      await supabase.auth.updateUser({
        email: trimmedEmail,
      }).catch(() => { })

      // 3. Log out after update as requested
      await supabase.auth.signOut()
      navigate("/", {
        replace: true,
        state: {
          notice:
            "Email updated successfully in database. Please sign in with your new email.",
        },
      })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to update email.",
      )
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <form className="w-full max-w-sm space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Update email</h1>
          <p className="text-sm text-muted-foreground">
            Current: {user?.email || "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground">
            You will be logged out after changing your email.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="email"
            autoComplete="email"
            placeholder="New email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            autoFocus
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="submit"
            className="flex-1"
            disabled={pending || !newEmail.trim()}
          >
            {pending ? "Updating…" : "Update email"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => navigate("/demo")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  )
}
