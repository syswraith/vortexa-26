import { Navigate, Route, Routes } from "react-router-dom"
import DemoPage from "@/pages/demo-page"
import LoginPage from "@/pages/login-page"
import UpdateEmailPage from "@/pages/update-email-page"
import UpdatePasswordPage from "@/pages/update-password-page"
import Dashboard from "@/pages/dashboard-page"
import { useSession } from "@/lib/session-context"

function HomeRoute() {
  const { session, loading } = useSession()

  if (loading) return null
  if (session) return <Navigate to="/demo" replace />

  return <LoginPage />
}

function ProtectedRoute({ children }) {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Navigate to="/" replace />

  return children
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route
        path="/demo"
        element={
          <ProtectedRoute>
            <DemoPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/update-creds"
        element={
          <ProtectedRoute>
            <UpdateEmailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/updatecreds"
        element={
          <ProtectedRoute>
            <UpdateEmailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/update-email"
        element={
          <ProtectedRoute>
            <UpdateEmailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/updateemail"
        element={
          <ProtectedRoute>
            <UpdateEmailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/update-password"
        element={
          <ProtectedRoute>
            <UpdatePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/updatepassword"
        element={
          <ProtectedRoute>
            <UpdatePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
