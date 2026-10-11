import { useEffect } from "react"
import DemoPage from "@/pages/demo-page"
import LoginPage from "@/pages/login-page"
import { useSession } from "@/lib/session-context"

function App() {
  const { session, loading } = useSession()
  const pathname = window.location.pathname.replace(/\/+$/, "")
  const isDemo = pathname === "/demo"

  useEffect(() => {
    if (isDemo && !loading && !session) {
      window.location.replace("/")
    }
  }, [isDemo, loading, session])

  if (isDemo) {
    if (loading || !session) return null
    return <DemoPage />
  }

  return <LoginPage />
}

export default App
