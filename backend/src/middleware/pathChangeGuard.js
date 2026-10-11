import { detectPathChange } from "../services/pathChangeDectector.js";

const SESSION_HEADER = "x-vortexa-session-id";
const SESSION_HEADER_ALIAS = "x-session-id";

/**
 * Resolves the current session ID from, in order:
 *   1. the x-vortexa-session-id request header
 *   2. the x-session-id request header (alias)
 *   3. a sessionId / session_id body field
 *   4. a sessionId / session_id query parameter
 *
 * The frontend keeps the session id in sessionStorage
 * (frontend/src/lib/session-tracking.jsx); send it as a header
 * from your API client to enable the guard.
 */
export function extractSessionId(req) {
  const headers = req.headers ?? {};
  const headerValue =
    headers[SESSION_HEADER] ?? headers[SESSION_HEADER_ALIAS];
  const fromHeader = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;
  if (typeof fromHeader === "string" && fromHeader.trim()) {
    return fromHeader.trim();
  }

  const fromBody = req.body?.sessionId ?? req.body?.session_id;
  if (typeof fromBody === "string" && fromBody.trim()) {
    return fromBody.trim();
  }

  const fromQuery = req.query?.sessionId ?? req.query?.session_id;
  if (typeof fromQuery === "string" && fromQuery.trim()) {
    return fromQuery.trim();
  }

  return null;
}

/**
 * Express middleware that stops a user from proceeding when their
 * current session performed a sensitive path change (password,
 * email, ...) just after the session was created.
 *
 * Usage:
 *   import { pathChangeGuard } from "./middleware/pathChangeGuard.js";
 *   app.use("/account", pathChangeGuard());
 *
 * Options:
 *   failOpen (default false) - when true, internal errors allow the
 *     request through (with a warning) instead of blocking it.
 *   onBlocked(req, assessment) - optional hook for logging/metrics.
 *
 * Requests without a resolvable session ID pass through untouched,
 * so unauthenticated routes are unaffected.
 */
export function pathChangeGuard(options = {}) {
  const { failOpen = false, onBlocked } = options;

  return async (req, res, next) => {
    const sessionId = extractSessionId(req);
    if (!sessionId) {
      return next();
    }

    try {
      const assessment = await detectPathChange({ sessionId });

      if (assessment.blocked) {
        if (typeof onBlocked === "function") {
          onBlocked(req, assessment);
        }

        console.warn(
          `[pathChangeGuard] blocked session ${sessionId}: ` +
            `${assessment.reason} (score ${assessment.score})`
        );

        return res.status(403).json({
          error: "Forbidden",
          code: "PATH_CHANGE_BLOCKED",
          message:
            "This session is not allowed to proceed because a " +
            "sensitive account change was detected right after " +
            "the session was created.",
          reason: assessment.reason,
          score: assessment.score,
          level: assessment.level,
          signals: assessment.signals,
        });
      }

      return next();
    } catch (error) {
      if (!failOpen) {
        return res.status(500).json({
          error: "Forbidden",
          code: "PATH_CHANGE_GUARD_ERROR",
          message: error.message,
        });
      }

      console.warn(
        "[pathChangeGuard] evaluation failed, allowing request:",
        error.message
      );
      return next();
    }
  };
}

export default pathChangeGuard;
