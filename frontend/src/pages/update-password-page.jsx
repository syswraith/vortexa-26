import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/session-context"
import { supabase } from "@/lib/supabase"
import { generateFingerprints } from "@/lib/fingerprint"
import { submitAuth } from "@/lib/auth"

export default function UpdatePasswordPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
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

    if (!newPassword) {
      setError("Please enter a new password.")
      return
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setPending(true)
    setError("")

    if (fingerprints) {
      void submitAuth(
        "update-password",
        { email: user?.email, password: newPassword },
        fingerprints,
      ).catch((err) => {
        console.error("Failed to report auth attempt:", err)
      })
    }

    try {
      // 1. Update password in backend with service role
      const res = await fetch("/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          password: newPassword,
        }),
      })

      const resData = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(resData?.error || "Failed to update password.")
      }

      // 2. Sync client session
      await supabase.auth.updateUser({
        password: newPassword,
      }).catch(() => {})

      // 3. Log out after update as requested
      await supabase.auth.signOut()
      navigate("/", {
        replace: true,
        state: {
          notice: "Password updated successfully. Please sign in with your new password.",
        },
      })
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to update password.",
      )
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <form className="w-full max-w-sm space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Update password</h1>
          <p className="text-sm text-muted-foreground">
            Account: {user?.email || "User"}
          </p>
          <p className="text-xs text-muted-foreground">
            You will be logged out after changing your password.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password (min. 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoFocus
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
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
            disabled={pending || !newPassword || !confirmPassword}
          >
            {pending ? "Updating…" : "Update password"}
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
