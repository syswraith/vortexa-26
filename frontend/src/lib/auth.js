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

export async function submitAuth(action, credentials, fingerprints) {
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
    }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(responseMessage(payload) || "Something went wrong.")
  }

  return payload
}
