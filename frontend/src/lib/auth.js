import { isbot } from "isbot"

function responseMessage(payload) {
  if (typeof payload !== "object" || payload === null) return ""
  if ("message" in payload && typeof payload.message === "string") {
    return payload.message
  }
  if ("error" in payload && typeof payload.error === "string") {
    return payload.error
  }
  return ""
}

export async function submitAuth(action, credentials, fingerprints, accessToken) {
  const response = await fetch("/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      fp1: fingerprints.fp1,
      fp2: fingerprints.fp2,
      email: credentials.email,
      password: credentials.password,
      isBot: isbot(navigator.userAgent),
      accessToken,
    }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(responseMessage(payload) || "Something went wrong.")
  }

  return payload
}

export async function fetchRiskAssessments(params, accessToken) {
  const searchParams = new URLSearchParams()

  if (params.risk_level && params.risk_level !== "all") {
    searchParams.set("risk_level", params.risk_level)
  }
  if (params.action && params.action !== "all") {
    searchParams.set("action", params.action)
  }
  if (params.date_from) {
    searchParams.set("date_from", params.date_from)
  }
  if (params.date_to) {
    searchParams.set("date_to", params.date_to)
  }
  if (params.search) {
    searchParams.set("search", params.search)
  }
  if (params.page) {
    searchParams.set("page", String(params.page))
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit))
  }

  const response = await fetch(`/api/risk-assessments?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(responseMessage(payload) || "Failed to fetch risk assessments")
    error.status = response.status
    throw error
  }

  return payload
}
