import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/session-context"
import { supabase } from "@/lib/supabase"

export default function DemoPage() {
  const { user } = useSession()

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.assign("/")
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold">Welcome, user</h1>
      {user?.email ? (
        <p className="text-sm text-muted-foreground">{user.email}</p>
      ) : null}
      <Button type="button" variant="outline" onClick={handleSignOut}>
        Sign out
      </Button>
    </main>
  )
}
