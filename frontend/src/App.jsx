import { Navigate, Route, Routes } from "react-router-dom"
import DemoPage from "@/pages/demo-page"
import LoginPage from "@/pages/login-page"
import { useSession } from "@/lib/session-context"

function HomeRoute() {
  const { session, loading } = useSession()

  if (loading) return null
  if (session) return <Navigate to="/demo" replace />

  return <LoginPage />
}

function ProtectedDemo() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Navigate to="/" replace />

  return <DemoPage />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/demo" element={<ProtectedDemo />} />
    </Routes>
  )
}

export default App
