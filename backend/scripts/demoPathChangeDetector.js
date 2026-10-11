#!/usr/bin/env node
/**
 * Manual demo for the sensitive path-change detection feature.
 *
 * This script exercises the real production functions in
 * backend/src/services/pathChangeDectector.js against your
 * Supabase database:
 *   - classifyPath
 *   - evaluatePathChange
 *   - getSessionById
 *   - getNavigationEvents
 *   - detectPathChange
 *
 * It also runs the pathChangeGuard middleware in-process with
 * mocked request/response objects to show how blocked sessions
 * are stopped with HTTP 403 while normal sessions proceed.
 *
 * For each scenario a temporary user_sessions row is created
 * (with a fixed created_at) and matching session_navigation_events
 * rows are inserted, so the evaluation is deterministic. Only the
 * demo sessions and their events are removed on exit; no user
 * rows are created or deleted.
 *
 * Usage:
 *   cd backend
 *   npm run demo:path-change
 */

import {
  PATH_CHANGE_CONFIG,
  classifyPath,
  detectPathChange,
  evaluatePathChange,
  getSessionById,
} from "../src/services/pathChangeDectector.js";
import { getSupabaseClient } from "../src/lib/supabase.js";
import { pathChangeGuard } from "../src/middleware/pathChangeGuard.js";

// ---------------------------------------------------------------------------
// Demo fixtures (offsets in seconds relative to session creation)
// ---------------------------------------------------------------------------

const RULE = "=".repeat(72);

const SCENARIOS = [
  {
    title: "Normal navigation",
    description: "The user landed on /demo right after login.",
    events: [{ path: "/demo", offsetSec: 3 }],
    expected: { blocked: false, level: "normal", reason: null },
  },
  {
    title: "Password change right after session start",
    description:
      "Five seconds after the session was created the user " +
      "navigated to the password change form.",
    events: [{ path: "/change-password", offsetSec: 5 }],
    expected: {
      blocked: true,
      level: "high",
      reason: "PASSWORD_CHANGE",
    },
  },
  {
    title: "Failed password change",
    description:
      "The user navigated to a failed password change route, " +
      "which carries a failure hint in the path.",
    events: [{ path: "/change-password/failed", offsetSec: 8 }],
    expected: {
      blocked: true,
      level: "high",
      reason: "FAILED_PASSWORD_CHANGE",
    },
  },
  {
    title: "Email change",
    description:
      "The user navigated to the email change route seconds " +
      "after login.",
    events: [{ path: "/change-email", offsetSec: 12 }],
    expected: { blocked: true, level: "high", reason: "EMAIL_CHANGE" },
  },
  {
    title: "Security settings only (review, no block)",
    description:
      "Viewing /security scores below the block threshold, so " +
      "the middleware lets the request through.",
    events: [{ path: "/security", offsetSec: 4 }],
    expected: {
      blocked: false,
      level: "review",
      reason: "SECURITY_SETTINGS",
    },
  },
  {
    title: "Sensitive path outside the session window",
    description:
      "The same password change, but performed after the " +
      "detection window has closed.",
    events: [
      {
        path: "/change-password",
        offsetSec: PATH_CHANGE_CONFIG.windowMs / 1000 + 10,
      },
    ],
    expected: { blocked: false, level: "normal", reason: null },
  },
  {
    title: "No navigation events",
    description: "A session with no recorded navigation at all.",
    events: [],
    expected: { blocked: false, level: "normal", reason: null },
  },
];

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function printHeader() {
  console.log(RULE);
  console.log("SENSITIVE PATH-CHANGE DETECTION DEMO");
  console.log(RULE);
  console.log("Exercises backend/src/services/pathChangeDectector.js");
  console.log("and backend/src/middleware/pathChangeGuard.js against the");
  console.log("real Supabase database configured by SUPABASE_URL.");
  console.log("");
  console.log(`Detection window: ${PATH_CHANGE_CONFIG.windowMs / 1000}s`);
  console.log(`Block threshold:  ${PATH_CHANGE_CONFIG.blockThreshold}`);
  console.log("");
  console.log("Temporary sessions and navigation events are removed");
  console.log("on exit. No user rows are created or deleted.");
  console.log(RULE);
}

function printScenarioHeader(index, total, scenario) {
  console.log("");
  console.log(RULE);
  console.log(`SCENARIO ${index}/${total}: ${scenario.title}`);
  console.log(RULE);
  console.log(scenario.description);
}

function printAssessment(result) {
  console.log("");
  console.log("Assessment:");
  console.log(`  blocked             ${result.blocked}`);
  console.log(`  score               ${result.score}`);
  console.log(`  level               ${result.level}`);
  console.log(`  reason              ${result.reason ?? "(none)"}`);
  if (result.notes) {
    console.log(`  notes               ${result.notes}`);
  }

  const paths = result.eventsInWindow.map(
    (event) => `${event.path} (${event.client_timestamp})`
  );
  console.log(
    `  events in window    ${
      paths.length > 0 ? paths.join(" | ") : "(none)"
    }`
  );

  for (const signal of result.signals) {
    console.log(
      `    - ${signal.rule} (+${signal.points}) ` +
        `${signal.failed ? "[failed attempt] " : ""}` +
        `${JSON.stringify({ path: signal.path })}`
    );
  }
}

function printExpectation(expected, result) {
  const matches =
    result.blocked === expected.blocked &&
    result.level === expected.level &&
    result.reason === expected.reason;

  console.log("");
  console.log(
    `  expected            blocked=${expected.blocked}, ` +
      `level=${expected.level}, reason=${expected.reason ?? "(none)"}`
  );
  console.log(`  matches expected    ${matches ? "yes" : "NO"}`);
  return matches;
}

// ---------------------------------------------------------------------------
// Demo database setup / cleanup (kept out of the production module)
// ---------------------------------------------------------------------------

async function pickDemoUserId(supabase) {
  const { data, error } = await supabase.auth.admin.listUsers({
    perPage: 1,
  });

  if (error) {
    throw new Error(`Could not list auth users (${error.message}).`);
  }

  const user = data?.users?.[0];
  if (!user) {
    throw new Error(
      "No auth user found. Sign in once through the app, then " +
        "rerun this demo."
    );
  }

  return user.id;
}

async function seedScenario(supabase, userId, scenario) {
  const now = new Date();
  const createdAt = now.toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("user_sessions")
    .insert({ user_id: userId, created_at: createdAt })
    .select("id")
    .single();

  if (sessionError) {
    throw new Error(`Could not create the demo session (${sessionError.message}).`);
  }

  const events = scenario.events.map((event, index) => ({
    session_id: session.id,
    user_id: userId,
    path: event.path,
    client_timestamp: new Date(
      now.getTime() + event.offsetSec * 1000 + index
    ).toISOString(),
  }));

  if (events.length > 0) {
    const { error: eventsError } = await supabase
      .from("session_navigation_events")
      .insert(events);

    if (eventsError) {
      throw new Error(
        `Could not insert demo navigation events (${eventsError.message}).`
      );
    }
  }

  return session.id;
}

async function cleanupSessions(supabase, sessionIds) {
  if (sessionIds.length === 0) return;

  // Navigation events are deleted via ON DELETE CASCADE.
  const { error } = await supabase
    .from("user_sessions")
    .delete()
    .in("id", sessionIds);

  if (error) {
    console.error(`Cleanup: could not delete demo sessions (${error.message}).`);
    return;
  }

  console.log("");
  console.log("Cleanup complete: demo sessions and events removed.");
}

// ---------------------------------------------------------------------------
// Middleware simulation (mocked Express request/response)
// ---------------------------------------------------------------------------

function runGuard(sessionId) {
  return new Promise((resolve) => {
    const req = {
      headers: { "x-vortexa-session-id": sessionId },
      body: {},
      query: {},
    };

    const res = {
      statusCode: null,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.payload = body;
        resolve({ stopped: true, statusCode: this.statusCode, body: this.payload });
      },
    };

    const next = () => resolve({ stopped: false, nextCalled: true });

    void pathChangeGuard()(req, res, next);
  });
}

async function demonstrateGuard(sessionId, title) {
  const outcome = await runGuard(sessionId);

  console.log("");
  console.log(`Middleware (pathChangeGuard) for: ${title}`);
  if (outcome.stopped) {
    console.log(
      `  -> request stopped with HTTP ${outcome.statusCode} ` +
        `(code ${outcome.body.code}, reason ${outcome.body.reason})`
    );
  } else {
    console.log("  -> request allowed to proceed (next() called)");
  }
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

async function runScenario(supabase, userId, scenario, index, total) {
  printScenarioHeader(index, total, scenario);

  const sessionId = await seedScenario(supabase, userId, scenario);
  console.log(`Seeded session id=${sessionId}`);

  for (const event of scenario.events) {
    const classification = classifyPath(event.path);
    console.log(
      `  classifyPath("${event.path}") = ${
        classification ? classification.rule : "(not sensitive)"
      }`
    );
  }

  // Prove the individual loaders work against the seeded rows.
  const session = await getSessionById(sessionId);
  console.log(
    `getSessionById -> created_at=${session.created_at}`
  );

  const result = await detectPathChange({ sessionId });
  printAssessment(result);
  const matched = printExpectation(scenario.expected, result);

  await demonstrateGuard(sessionId, scenario.title);

  return { matched, sessionId };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    console.error("");
    console.error(`Configuration error: ${error.message}`);
    console.error("");
    console.error(
      "Set the variables in backend/.env (copy backend/.env.example) and rerun."
    );
    process.exitCode = 1;
    return;
  }

  printHeader();

  const sessionIds = [];
  let allMatched = true;

  try {
    const demoUserId = await pickDemoUserId(supabase);
    console.log(`Using existing auth user id=${demoUserId}`);

    // Pure-function smoke checks that need no database.
    const pureCases = [
      ["/demo", null],
      ["/change-password", "PASSWORD_CHANGE"],
      ["/change-password/failed", "PASSWORD_CHANGE"],
      ["/change-email", "EMAIL_CHANGE"],
    ];
    for (const [path, expectedRule] of pureCases) {
      const rule = classifyPath(path)?.rule ?? null;
      const ok = rule === expectedRule;
      allMatched = allMatched && ok;
      console.log(
        `  classifyPath("${path}") = ${rule} ` +
          `${ok ? "" : `(expected ${expectedRule}) NO`}`
      );
    }

    // Pure evaluation with synthetic rows (no database round trip).
    const synthetic = evaluatePathChange(
      { id: "00000000-0000-4000-8000-000000000000", user_id: demoUserId, created_at: "2026-01-01T00:00:00.000Z" },
      [
        {
          id: "00000000-0000-4000-8000-000000000001",
          session_id: "00000000-0000-4000-8000-000000000000",
          user_id: demoUserId,
          path: "/demo",
          client_timestamp: "2026-01-01T00:00:02.000Z",
        },
      ]
    );
    console.log(
      `  evaluatePathChange(normal) -> blocked=${synthetic.blocked}, level=${synthetic.level}`
    );

    for (let index = 0; index < SCENARIOS.length; index += 1) {
      const { matched, sessionId } = await runScenario(
        supabase,
        demoUserId,
        SCENARIOS[index],
        index + 1,
        SCENARIOS.length
      );
      allMatched = allMatched && matched;
      sessionIds.push(sessionId);
    }

    console.log("");
    console.log(RULE);
    console.log(
      allMatched
        ? "All scenarios matched their expected result."
        : "Some scenarios did NOT match their expected result (see above)."
    );
    console.log(RULE);
  } catch (error) {
    console.error("");
    console.error(`Demo failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await cleanupSessions(supabase, sessionIds);
  }
}

main();
