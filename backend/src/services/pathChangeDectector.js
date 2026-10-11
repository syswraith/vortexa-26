import { getSupabaseClient } from "../lib/supabase.js";

const SESSIONS_TABLE = "user_sessions";
const NAVIGATION_TABLE = "session_navigation_events";

/**
 * Configurable heuristic rules for sensitive "path change" detection.
 *
 * The frontend writes one session_navigation_events row per route change
 * (see frontend/src/lib/navigation-tracking.jsx). This service looks at
 * the navigation that happened just after a session was created and
 * decides whether the user tried to change account security state
 * (password, email, ...) in that window, optionally including failed
 * attempts encoded in the path.
 */
export const PATH_CHANGE_CONFIG = {
  // Navigation is only considered within this window after the session
  // row was created ("just after the session is created").
  windowMs: 2 * 60 * 1000,
  // Tolerates client/server clock skew when comparing timestamps.
  clockSkewMs: 5_000,
  // Routes that change account security state, ordered by severity.
  // Matched against the raw path (the frontend records location.pathname).
  sensitiveRules: [
    {
      rule: "PASSWORD_CHANGE",
      category: "password",
      points: 40,
      pattern:
        /(?:^|[/])(?:(?:change|update|set|new)[-/]?(?:password|passwd)|(?:password|passwd)[-/](?:change|update|set)|(?:settings|account|profile)[-/](?:password|passwd))/i,
    },
    {
      rule: "PASSWORD_RESET",
      category: "password",
      points: 35,
      pattern:
        /(?:^|[/])(?:reset|forgot|recover)[-/]?(?:password|passwd)|(?:password|passwd)[-/](?:reset|forgot|recover)/i,
    },
    {
      rule: "EMAIL_CHANGE",
      category: "email",
      points: 40,
      pattern:
        /(?:^|[/])(?:(?:change|update|set|new|verify)[-/]?email|email[-/](?:change|update|set|verify)|(?:settings|account|profile)[-/]email)/i,
    },
    {
      rule: "PHONE_CHANGE",
      category: "phone",
      points: 30,
      pattern:
        /(?:^|[/])(?:(?:change|update|set|new|verify)[-/]?(?:phone|mobile|number)|(?:phone|mobile|number)[-/](?:change|update|set|verify)|(?:settings|account|profile)[-/](?:phone|mobile|number))/i,
    },
    {
      rule: "TWO_FACTOR_CHANGE",
      category: "mfa",
      points: 35,
      pattern: /(?:^|[/])(?:two[-/]?factor|2fa|mfa|otp)(?:[/]|$)/i,
    },
    {
      rule: "SECURITY_SETTINGS",
      category: "security",
      points: 25,
      pattern: /(?:^|[/])(?:security|privacy)(?:[/]|$)/i,
    },
  ],
  // Path fragments that mark an attempt as failed, e.g. a client that
  // navigated to /change-password/failed after a rejected submission.
  failureHintPattern:
    /(?:^|[^a-z])(?:fail(?:ed|ure)?|error|invalid|denied|expired|mismatch|unsuccessful|wrong|retry)(?:[^a-z]|$)/i,
  // Extra points when a sensitive path also looks like a failed attempt.
  failedAttemptBonus: 20,
  // Total score is capped at this value.
  scoreCap: 100,
  // Any score at or above this value blocks the request in the middleware.
  blockThreshold: 40,
  // normal: < review. review: [review, high). high: >= high.
  levelThresholds: {
    review: 20,
    high: 40,
  },
  // Maximum number of navigation events considered per evaluation.
  maxEvents: 50,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(value, field = "ID") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new Error(
      `Invalid ${field}: expected a UUID, received ${JSON.stringify(value)}.`
    );
  }
  return value.trim();
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Classifies a single navigation path. Returns the matching sensitive
 * rule (with a `failed` flag and adjusted points when the path also
 * carries a failure hint), or null for ordinary navigation.
 */
export function classifyPath(path) {
  if (typeof path !== "string" || path.trim().length === 0) return null;

  const normalizedPath = path.trim();

  for (const { rule, category, points, pattern } of PATH_CHANGE_CONFIG
    .sensitiveRules) {
    if (!pattern.test(normalizedPath)) continue;

    const failed = PATH_CHANGE_CONFIG.failureHintPattern.test(normalizedPath);

    return {
      rule,
      category,
      failed,
      points: failed
        ? points + PATH_CHANGE_CONFIG.failedAttemptBonus
        : points,
    };
  }

  return null;
}

/**
 * True when the path targets a sensitive account-security route.
 */
export function isSensitivePath(path) {
  return classifyPath(path) !== null;
}

/**
 * Pure evaluation: given a session row and its navigation events, decides
 * whether a sensitive path change happened just after the session was
 * created. Never throws for missing data; it simply skips events whose
 * inputs are unavailable.
 */
export function evaluatePathChange(session, events = [], options = {}) {
  const createdAtMs = Date.parse(session?.created_at);
  if (!Number.isFinite(createdAtMs)) {
    return {
      blocked: false,
      score: 0,
      level: "insufficient_data",
      reason: null,
      signals: [],
      eventsInWindow: [],
      session: session
        ? {
            id: session.id,
            userId: session.user_id,
            createdAt: session.created_at,
          }
        : null,
      notes: "The session has no usable created_at timestamp.",
    };
  }

  const {
    windowMs = PATH_CHANGE_CONFIG.windowMs,
    clockSkewMs = PATH_CHANGE_CONFIG.clockSkewMs,
    scoreCap = PATH_CHANGE_CONFIG.scoreCap,
    blockThreshold = PATH_CHANGE_CONFIG.blockThreshold,
    levelThresholds = PATH_CHANGE_CONFIG.levelThresholds,
  } = options;

  const windowEndMs = createdAtMs + windowMs;
  const signals = [];
  const eventsInWindow = [];

  for (const event of events) {
    const timestampMs = Date.parse(event?.client_timestamp);
    if (!Number.isFinite(timestampMs)) continue;
    if (timestampMs < createdAtMs - clockSkewMs) continue;
    if (timestampMs > windowEndMs) continue;

    eventsInWindow.push(event);

    const match = classifyPath(event.path);
    if (!match) continue;

    signals.push({
      ...match,
      eventId: event.id ?? null,
      path: event.path,
      timestamp: event.client_timestamp,
      secondsAfterSessionStart: round((timestampMs - createdAtMs) / 1000, 1),
    });
  }

  // Highest-severity signal first, so `reason` and the API response
  // surface the most serious change.
  signals.sort((a, b) => b.points - a.points);

  const rawScore = signals.reduce((total, signal) => total + signal.points, 0);
  const score = Math.min(scoreCap, rawScore);
  const { review, high } = levelThresholds;
  const level = score >= high ? "high" : score >= review ? "review" : "normal";
  const topSignal = signals[0] ?? null;

  return {
    blocked: score >= blockThreshold,
    score,
    level,
    reason: topSignal
      ? topSignal.failed
        ? `FAILED_${topSignal.rule}`
        : topSignal.rule
      : null,
    signals,
    eventsInWindow,
    session: {
      id: session.id,
      userId: session.user_id,
      createdAt: session.created_at,
    },
    windowMs,
    notes:
      signals.length === 0
        ? "No sensitive path change within the session window."
        : undefined,
  };
}

/**
 * Loads a single session row by ID, including its creation time.
 */
export async function getSessionById(sessionId) {
  const validSessionId = assertValidUuid(sessionId, "session ID");
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("id,user_id,created_at,last_seen_at")
    .eq("id", validSessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load session: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Loads the navigation events for a session, oldest first. When
 * `sinceIso` is given, only events at or after that timestamp are
 * returned (server-side filtering keeps the evaluation cheap).
 */
export async function getNavigationEvents(sessionId, sinceIso = null) {
  const validSessionId = assertValidUuid(sessionId, "session ID");
  const supabase = getSupabaseClient();

  let query = supabase
    .from(NAVIGATION_TABLE)
    .select("id,session_id,user_id,path,client_timestamp")
    .eq("session_id", validSessionId)
    .order("client_timestamp", { ascending: true })
    .limit(PATH_CHANGE_CONFIG.maxEvents);

  if (sinceIso) {
    query = query.gte("client_timestamp", sinceIso);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Failed to load session navigation events: ${error.message}`
    );
  }

  return data ?? [];
}

/**
 * End-to-end workflow: load the session, load its navigation events
 * since the session started, then evaluate them against the session
 * creation window.
 *
 * The session ID must come from a trusted server-side context (e.g. a
 * header set by your auth layer); the user ID, when provided, is only
 * used to verify that the session belongs to that user.
 */
export async function detectPathChange({ sessionId, userId } = {}) {
  if (sessionId === null || sessionId === undefined || sessionId === "") {
    throw new Error("A session ID is required to detect path changes.");
  }

  const validSessionId = assertValidUuid(sessionId, "session ID");

  const session = await getSessionById(validSessionId);
  if (!session) {
    return {
      blocked: false,
      score: 0,
      level: "insufficient_data",
      reason: null,
      signals: [],
      eventsInWindow: [],
      session: null,
      notes: "No session found for the given session ID.",
    };
  }

  if (userId) {
    const validUserId = assertValidUuid(userId, "user ID");
    if (session.user_id !== validUserId) {
      throw new Error("The session does not belong to the provided user ID.");
    }
  }

  // Only events recorded at/after session creation (minus clock skew)
  // are relevant; older events belong to previous sessions.
  const sinceMs = Date.parse(session.created_at) - PATH_CHANGE_CONFIG.clockSkewMs;
  const events = await getNavigationEvents(
    validSessionId,
    new Date(sinceMs).toISOString()
  );

  return evaluatePathChange(session, events);
}

export { SESSIONS_TABLE, NAVIGATION_TABLE };
