import DemoPage from "@/pages/demo-page"
import LoginPage from "@/pages/login-page"

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "")

  if (pathname === "/demo") return <DemoPage />

  return <LoginPage />
}

export default App
