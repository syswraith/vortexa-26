const fingerprintTimeoutMs = 3000
const unavailableSignal = "unavailable"

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = source
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${source}`))
    document.head.append(script)
  })
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      window.setTimeout(
        () => reject(new Error("Fingerprinting timed out")),
        timeoutMs,
      )
    }),
  ])
}

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

export async function collectFingerprint() {
  await Promise.allSettled([
    loadScript("/fp.min.js"),
    loadScript("/thumbmark.umd.js"),
  ])

  const fingerprint = window.FingerprintJS
    ? withTimeout(window.FingerprintJS.load(), fingerprintTimeoutMs)
        .then((agent) => agent.get())
        .then((result) => result.visitorId)
        .catch((error) => {
          console.error("FingerprintJS failed:", error)
          return unavailableSignal
        })
    : Promise.resolve(unavailableSignal)

  const thumbmark = window.ThumbmarkJS
    ? withTimeout(new window.ThumbmarkJS.Thumbmark().get(), fingerprintTimeoutMs)
        .then((result) => result.thumbmark)
        .catch((error) => {
          console.error("ThumbmarkJS failed:", error)
          return unavailableSignal
        })
    : Promise.resolve(unavailableSignal)

  const [visitorId, thumbmarkId] = await Promise.all([fingerprint, thumbmark])

  const response = await fetch("/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fingerprint: visitorId, thumbmark: thumbmarkId }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(responseMessage(payload) || "This link could not be opened.")
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.longLink !== "string"
  ) {
    throw new Error("This link could not be opened.")
  }

  return payload.longLink
}
