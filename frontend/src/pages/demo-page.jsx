import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/session-context"
import { supabase } from "@/lib/supabase"

export default function DemoPage() {
  const { user } = useSession()
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut({ scope: "local" })
    navigate("/", { replace: true })
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Welcome, user</h1>
          {user?.email ? (
            <p className="text-sm text-muted-foreground">{user.email}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={() => navigate("/update-creds")}
          >
            Update email
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={() => navigate("/update-password")}
          >
            Update password
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-center text-muted-foreground hover:text-foreground"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </div>
      </div>
    </main>
  )
}
