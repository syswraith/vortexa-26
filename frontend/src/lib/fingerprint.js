const fingerprintTimeoutMs = 3000

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

export async function generateFingerprints() {
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
          return ""
        })
    : Promise.resolve("")

  const thumbmark = window.ThumbmarkJS
    ? withTimeout(new window.ThumbmarkJS.Thumbmark().get(), fingerprintTimeoutMs)
        .then((result) => result.thumbmark)
        .catch((error) => {
          console.error("ThumbmarkJS failed:", error)
          return ""
        })
    : Promise.resolve("")

  const [fp1, fp2] = await Promise.all([fingerprint, thumbmark])
  return { fp1: fp1 || "", fp2: fp2 || "" }
}
