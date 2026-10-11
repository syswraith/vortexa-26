import { useMemo } from "react"
import RedirectPage from "@/pages/redirect-page"

function readRedirectData() {
  const element = document.getElementById("app-data")
  if (element?.textContent) {
    try {
      const value = JSON.parse(element.textContent)

      if (
        typeof value === "object" &&
        value !== null &&
        "shortLink" in value &&
        typeof value.shortLink === "string"
      ) {
        return { shortLink: value.shortLink }
      }
    } catch {
      return null
    }
  }

  const shortLink = window.location.pathname.replace(/^\/+|\/+$/g, "")
  return shortLink ? { shortLink } : null
}

function App() {
  const data = useMemo(() => readRedirectData(), [])

  return <RedirectPage data={data} />
}

export default App
