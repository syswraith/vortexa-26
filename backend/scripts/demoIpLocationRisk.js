#!/usr/bin/env node
/**
 * Manual demo for the IP/location anomaly detection feature.
 *
 * This script exercises the real production functions in
 * backend/src/services/ipLocationRisk.js against your Supabase database:
 *   - getPreviousObservations
 *   - calculateDistance
 *   - evaluateLocationRisk
 *   - saveIpLocationObservation
 *   - assessCurrentLocation
 *
 * It creates a clearly identified demo user in public."Users", inserts
 * deterministic observations, runs several scenarios, prints the inputs and
 * the assessment, then removes ONLY the demo user and its observations.
 *
 * No external geolocation APIs are called. Every IP address is drawn from the
 * RFC 5737 documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
 * and does not represent a real client.
 *
 * Usage:
 *   cd backend
 *   npm run demo:ip-risk
 */

import {
  IP_LOCATION_TABLE,
  USERS_TABLE,
  assessCurrentLocation,
  calculateDistance,
  getPreviousObservations,
  saveIpLocationObservation,
} from "../src/services/ipLocationRisk.js";
import { getSupabaseClient } from "../src/lib/supabase.js";

// ---------------------------------------------------------------------------
// Demo fixtures (fixed timestamps and coordinates for reproducibility)
// ---------------------------------------------------------------------------

const DEMO_USER = {
  name: "IP Location Risk Demo (safe to delete)",
  email: "ip-location-risk-demo@example.com",
};

const IP_NEW_YORK = "203.0.113.10"; // RFC 5737 TEST-NET-3
const IP_NEW_YORK_2 = "198.51.100.20"; // RFC 5737 TEST-NET-2
const IP_SYDNEY = "192.0.2.30"; // RFC 5737 TEST-NET-1

const T0 = "2026-01-01T00:00:00.000Z";
const T_PLUS_30_MIN = "2026-01-01T00:30:00.000Z";
const T_PLUS_1_HOUR = "2026-01-01T01:00:00.000Z";

const NEW_YORK = {
  country_code: "US",
  region: "New York",
  city: "New York",
  latitude: 40.7128,
  longitude: -74.006,
  asn: 64500,
  isp: "Documentation ISP (New York)",
  timezone: "America/New_York",
};

// ~1.1 km north of NEW_YORK: "approximately the same location".
const NEW_YORK_NEARBY = {
  ...NEW_YORK,
  latitude: 40.7228,
  longitude: -74.006,
};

const SYDNEY = {
  country_code: "AU",
  region: "New South Wales",
  city: "Sydney",
  latitude: -33.8688,
  longitude: 151.2093,
  asn: 64502,
  isp: "Documentation ISP (Sydney)",
  timezone: "Australia/Sydney",
};

function observation(ipAddress, place, observedAt, overrides = {}) {
  return {
    ip_address: ipAddress,
    ...place,
    observed_at: observedAt,
    geo_provider: "demo-fixed",
    geo_lookup_success: true,
    ...overrides,
  };
}

const SCENARIOS = [
  {
    title: "No history yet (insufficient data)",
    description:
      "First observation for the account: there is nothing to compare against.",
    previous: null,
    current: observation(IP_NEW_YORK, NEW_YORK, T0),
    expected: { level: "insufficient_data", rules: [] },
  },
  {
    title: "Same IP and same location",
    description: "Identical IP and coordinates one hour apart.",
    previous: observation(IP_NEW_YORK, NEW_YORK, T0),
    current: observation(IP_NEW_YORK, NEW_YORK, T_PLUS_1_HOUR),
    expected: { level: "normal", rules: [] },
  },
  {
    title: "Different IP, approximately same location",
    description:
      "IP changed but the account stayed in New York (~1 km away). " +
      "Expect only an IP-change signal.",
    previous: observation(IP_NEW_YORK, NEW_YORK, T0),
    current: observation(IP_NEW_YORK_2, NEW_YORK_NEARBY, T_PLUS_1_HOUR),
    expected: { level: "normal", rules: ["IP_CHANGED"] },
  },
  {
    title: "Distant location in an implausibly short time",
    description:
      "New York to Sydney in 30 minutes. Expect country, distance, travel " +
      "time, ASN and timezone signals.",
    previous: observation(IP_NEW_YORK, NEW_YORK, T0),
    current: observation(IP_SYDNEY, SYDNEY, T_PLUS_30_MIN),
    expected: {
      level: "high",
      rules: [
        "IP_CHANGED",
        "COUNTRY_CHANGED",
        "LARGE_LOCATION_CHANGE",
        "IMPLAUSIBLE_TRAVEL_TIME",
        "ASN_CHANGED",
        "TIMEZONE_CHANGED",
      ],
    },
  },
  {
    title: "Failed geolocation lookup / missing coordinates",
    description:
      "The IP changed but the lookup failed, so no coordinates are stored. " +
      "The IP signal still fires; location signals are safely skipped.",
    previous: observation(IP_NEW_YORK, NEW_YORK, T0),
    current: {
      ip_address: IP_NEW_YORK_2,
      observed_at: T_PLUS_1_HOUR,
      geo_provider: null,
      geo_lookup_success: false,
    },
    expected: { level: "normal", rules: ["IP_CHANGED"] },
  },
];

// ---------------------------------------------------------------------------
// Small output helpers
// ---------------------------------------------------------------------------

const RULE = "=".repeat(72);

function printHeader() {
  console.log(RULE);
  console.log("IP / LOCATION ANOMALY RISK DEMO");
  console.log(RULE);
  console.log("Exercises backend/src/services/ipLocationRisk.js against the real");
  console.log("Supabase database configured by SUPABASE_URL.");
  console.log("");
  console.log("All IP addresses are documentation-only examples (RFC 5737");
  console.log("TEST-NET ranges). They do not represent real clients.");
  console.log("No external geolocation APIs are called.");
  console.log("");
  console.log(`Demo user: ${DEMO_USER.email} (temporary; removed on exit)`);
  console.log(RULE);
}

function printScenarioHeader(index, total, scenario) {
  console.log("");
  console.log(RULE);
  console.log(`SCENARIO ${index}/${total}: ${scenario.title}`);
  console.log(RULE);
  console.log(scenario.description);
  console.log("");
}

function printObservation(label, value) {
  console.log(`${label}:`);
  if (!value) {
    console.log("  (none)");
    return;
  }
  const fields = [
    ["ip_address", value.ip_address],
    ["country_code", value.country_code],
    ["city", value.city],
    ["latitude", value.latitude],
    ["longitude", value.longitude],
    ["asn", value.asn],
    ["timezone", value.timezone],
    ["observed_at", value.observed_at],
    ["geo_lookup_success", value.geo_lookup_success],
  ];
  for (const [key, fieldValue] of fields) {
    const shown =
      fieldValue === null || fieldValue === undefined ? "null" : fieldValue;
    console.log(`  ${key.padEnd(20)} ${shown}`);
  }
}

function printAssessment(result) {
  console.log("");
  console.log("Assessment:");
  console.log(
    `  distance_km          ${
      result.distanceKm === null ? "null (not enough coordinate data)" : result.distanceKm
    }`
  );
  console.log(`  score               ${result.score}`);
  console.log(`  level               ${result.level}`);
  if (result.notes) {
    console.log(`  notes               ${result.notes}`);
  }

  console.log(
    `  triggered signals   ${
      result.signals.length > 0
        ? result.signals.map((signal) => signal.rule).join(", ")
        : "(none)"
    }`
  );
  for (const signal of result.signals) {
    console.log(
      `    - ${signal.rule} (+${signal.points}) ${JSON.stringify(signal.details)}`
    );
  }
}

function printExpectation(expected, result) {
  const actualRules = result.signals
    .map((signal) => signal.rule)
    .sort()
    .join(",");
  const expectedRules = [...expected.rules].sort().join(",");
  const matches = result.level === expected.level && actualRules === expectedRules;

  console.log("");
  console.log(
    `  expected            level=${expected.level}, signals=[${expected.rules.join(
      ", "
    )}]`
  );
  console.log(`  matches expected    ${matches ? "yes" : "NO"}`);
  return matches;
}

// ---------------------------------------------------------------------------
// Demo database setup / cleanup (kept out of the production module)
// ---------------------------------------------------------------------------

async function assertObservationsTable(supabase) {
  const { error } = await supabase
    .from(IP_LOCATION_TABLE)
    .select("id")
    .limit(1);

  if (error) {
    throw new Error(
      `Could not read public.${IP_LOCATION_TABLE} (${error.message}). ` +
        "Apply supabase/migrations/20261011120000_create_ip_location_observations.sql first."
    );
  }
}

async function ensureDemoUser(supabase) {
  const { data: existing, error: selectError } = await supabase
    .from(USERS_TABLE)
    .select("uid,name,email")
    .eq("email", DEMO_USER.email)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `Could not query public."${USERS_TABLE}" (${selectError.message}). ` +
        'Expected columns uid, name, email.'
    );
  }

  if (existing) {
    console.log(`Reusing existing demo user uid=${existing.uid}`);
    return existing;
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .insert({ name: DEMO_USER.name, email: DEMO_USER.email })
    .select("uid,name,email")
    .single();

  if (error) {
    throw new Error(`Could not create the demo user (${error.message}).`);
  }

  console.log(`Created demo user uid=${data.uid}`);
  return data;
}

async function clearDemoObservations(supabase, accountId) {
  const { error } = await supabase
    .from(IP_LOCATION_TABLE)
    .delete()
    .eq("account_id", accountId);

  if (error) {
    throw new Error(`Could not clear demo observations (${error.message}).`);
  }
}

async function cleanupDemo(supabase, accountId) {
  try {
    const { error: observationsError } = await supabase
      .from(IP_LOCATION_TABLE)
      .delete()
      .eq("account_id", accountId);

    if (observationsError) {
      console.error(
        `Cleanup: could not delete demo observations (${observationsError.message}).`
      );
    }

    // Only delete the row that is unambiguously the demo user.
    const { error: userError } = await supabase
      .from(USERS_TABLE)
      .delete()
      .eq("uid", accountId)
      .eq("email", DEMO_USER.email)
      .eq("name", DEMO_USER.name);

    if (userError) {
      console.error(`Cleanup: could not delete demo user (${userError.message}).`);
      return;
    }

    console.log("");
    console.log("Cleanup complete: demo user and its observations removed.");
  } catch (error) {
    console.error(`Cleanup failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

async function runScenario(supabase, accountId, scenario, index, total) {
  printScenarioHeader(index, total, scenario);

  // Start each scenario from a clean slate for this demo account only.
  await clearDemoObservations(supabase, accountId);

  if (scenario.previous) {
    await saveIpLocationObservation(accountId, scenario.previous);
  }

  // Prove getPreviousObservations returns the seeded history.
  const history = await getPreviousObservations(accountId);
  console.log(
    `History loaded for account: ${history.length} observation(s) ` +
      `(function getPreviousObservations)`
  );

  // Show the raw Haversine result before the full assessment.
  const directDistance = calculateDistance(history[0] ?? null, scenario.current);
  console.log(
    `calculateDistance(previous, current) = ${
      directDistance === null ? "null" : `${directDistance} km`
    }`
  );

  // Full workflow: load history, assess, and persist the current observation.
  const result = await assessCurrentLocation(accountId, scenario.current);

  console.log("");
  printObservation("Previous observation (baseline used)", result.previousObservation);
  console.log("");
  printObservation("Current observation (saved)", result.savedObservation);
  printAssessment(result);

  return printExpectation(scenario.expected, result);
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

  let demoUser = null;
  let allMatched = true;

  try {
    demoUser = await ensureDemoUser(supabase);
    await assertObservationsTable(supabase);

    for (let index = 0; index < SCENARIOS.length; index += 1) {
      const matched = await runScenario(
        supabase,
        demoUser.uid,
        SCENARIOS[index],
        index + 1,
        SCENARIOS.length
      );
      allMatched = allMatched && matched;
    }

    console.log("");
    console.log(RULE);
    console.log(
      allMatched
        ? "All scenarios matched their expected risk level and signals."
        : "Some scenarios did NOT match their expected result (see above)."
    );
    console.log(RULE);
  } catch (error) {
    console.error("");
    console.error(`Demo failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (demoUser?.uid) {
      await cleanupDemo(supabase, demoUser.uid);
    }
  }
}

main();
