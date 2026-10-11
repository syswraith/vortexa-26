import { getSupabaseClient } from "../lib/supabase.js";

const TABLE = "ip_location_observations";
const USERS_TABLE = "Users";

/**
 * Configurable heuristic rules for IP/location risk. Adjust weights or
 * thresholds here without touching the evaluation logic below.
 */
export const RISK_CONFIG = {
  weights: {
    IP_CHANGED: 5,
    COUNTRY_CHANGED: 30,
    LARGE_LOCATION_CHANGE: 15,
    IMPLAUSIBLE_TRAVEL_TIME: 30,
    ASN_CHANGED: 10,
    TIMEZONE_CHANGED: 5,
  },
  // A location change is considered "large" at or above this distance.
  largeLocationChangeKm: 500,
  // Implied travel speed above this is physically implausible.
  maxPlausibleSpeedKmh: 900,
  // Total score is capped at this value.
  scoreCap: 100,
  // normal: < review. review: [review, high). high: >= high.
  levelThresholds: {
    review: 30,
    high: 60,
  },
  // Maximum number of previous observations considered.
  historyLimit: 20,
};

const OBSERVATION_FIELDS = [
  "id",
  "account_id",
  "ip_address",
  "country_code",
  "region",
  "city",
  "latitude",
  "longitude",
  "asn",
  "isp",
  "timezone",
  "observed_at",
  "geo_provider",
  "geo_lookup_success",
].join(",");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EARTH_RADIUS_KM = 6371.0088;

function assertValidAccountId(accountId) {
  if (typeof accountId !== "string" || !UUID_PATTERN.test(accountId.trim())) {
    throw new Error(
      `Invalid account ID: expected a UUID, received ${JSON.stringify(accountId)}.`
    );
  }
  return accountId.trim();
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function toNullableInteger(value) {
  const number = toFiniteNumber(value);
  return number === null ? null : Math.trunc(number);
}

function nullableString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeIp(value) {
  return nullableString(value)?.toLowerCase() ?? null;
}

function normalizeText(value) {
  return nullableString(value);
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * True when an observation has two in-range coordinates and can be used as a
 * geographic baseline.
 */
export function hasUsableCoordinates(observation) {
  const latitude = toFiniteNumber(observation?.latitude);
  const longitude = toFiniteNumber(observation?.longitude);
  return (
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * Haversine distance between two observations' coordinates, in kilometres.
 * Returns null when either side lacks valid coordinates.
 */
export function calculateDistance(previous, current) {
  const previousLat = toFiniteNumber(previous?.latitude);
  const previousLon = toFiniteNumber(previous?.longitude);
  const currentLat = toFiniteNumber(current?.latitude);
  const currentLon = toFiniteNumber(current?.longitude);

  if (
    [previousLat, previousLon, currentLat, currentLon].some(
      (value) => value === null
    )
  ) {
    return null;
  }

  if (
    Math.abs(previousLat) > 90 ||
    Math.abs(currentLat) > 90 ||
    Math.abs(previousLon) > 180 ||
    Math.abs(currentLon) > 180
  ) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(currentLat - previousLat);
  const deltaLon = toRadians(currentLon - previousLon);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(previousLat)) *
      Math.cos(toRadians(currentLat)) *
      Math.sin(deltaLon / 2) ** 2;

  // Clamp for floating-point safety so Math.sqrt(1 - a) never goes negative.
  const clamped = Math.min(1, Math.max(0, a));
  const centralAngle = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  const distance = EARTH_RADIUS_KM * centralAngle;

  return Number.isFinite(distance) ? round(distance, 2) : null;
}

function riskLevelFor(score) {
  const { review, high } = RISK_CONFIG.levelThresholds;
  if (score >= high) return "high";
  if (score >= review) return "review";
  return "normal";
}

function makeSignal(rule, details) {
  return {
    rule,
    points: RISK_CONFIG.weights[rule],
    details,
  };
}

function evaluateTravelTime(previous, current, distanceKm) {
  if (distanceKm === null) return null;

  const previousMs = Date.parse(previous?.observed_at);
  const currentMs = Date.parse(current?.observed_at);
  if (!Number.isFinite(previousMs) || !Number.isFinite(currentMs)) return null;

  const elapsedMs = currentMs - previousMs;
  if (!(elapsedMs > 0)) return null;

  const elapsedHours = elapsedMs / 3_600_000;
  const impliedSpeedKmh = distanceKm / elapsedHours;

  if (!(impliedSpeedKmh > RISK_CONFIG.maxPlausibleSpeedKmh)) return null;

  return {
    distanceKm,
    elapsedHours: round(elapsedHours, 3),
    impliedSpeedKmh: round(impliedSpeedKmh, 1),
    thresholdKmh: RISK_CONFIG.maxPlausibleSpeedKmh,
  };
}

/**
 * Compares a previous observation with a current one and returns an explainable
 * risk assessment. Never throws for missing data; it simply skips rules whose
 * inputs are unavailable.
 */
export function evaluateLocationRisk(previous, current) {
  if (!previous) {
    return {
      score: 0,
      level: "insufficient_data",
      distanceKm: null,
      signals: [],
      notes: "No previous observation was available for comparison.",
    };
  }

  if (!current) {
    return {
      score: 0,
      level: "insufficient_data",
      distanceKm: null,
      signals: [],
      notes: "No current observation was provided for comparison.",
    };
  }

  const signals = [];
  const distanceKm = calculateDistance(previous, current);

  const previousIp = normalizeIp(previous.ip_address);
  const currentIp = normalizeIp(current.ip_address);
  if (previousIp && currentIp && previousIp !== currentIp) {
    signals.push(
      makeSignal("IP_CHANGED", { previous: previousIp, current: currentIp })
    );
  }

  const previousCountry = normalizeText(previous.country_code);
  const currentCountry = normalizeText(current.country_code);
  if (previousCountry && currentCountry && previousCountry !== currentCountry) {
    signals.push(
      makeSignal("COUNTRY_CHANGED", {
        previous: previousCountry,
        current: currentCountry,
      })
    );
  }

  if (
    distanceKm !== null &&
    distanceKm >= RISK_CONFIG.largeLocationChangeKm
  ) {
    signals.push(
      makeSignal("LARGE_LOCATION_CHANGE", {
        distanceKm,
        thresholdKm: RISK_CONFIG.largeLocationChangeKm,
      })
    );
  }

  const travel = evaluateTravelTime(previous, current, distanceKm);
  if (travel) {
    signals.push(makeSignal("IMPLAUSIBLE_TRAVEL_TIME", travel));
  }

  const previousAsn = toFiniteNumber(previous.asn);
  const currentAsn = toFiniteNumber(current.asn);
  if (previousAsn !== null && currentAsn !== null && previousAsn !== currentAsn) {
    signals.push(
      makeSignal("ASN_CHANGED", { previous: previousAsn, current: currentAsn })
    );
  }

  const previousTimezone = normalizeText(previous.timezone);
  const currentTimezone = normalizeText(current.timezone);
  if (
    previousTimezone &&
    currentTimezone &&
    previousTimezone !== currentTimezone
  ) {
    signals.push(
      makeSignal("TIMEZONE_CHANGED", {
        previous: previousTimezone,
        current: currentTimezone,
      })
    );
  }

  const rawScore = signals.reduce((total, signal) => total + signal.points, 0);
  const score = Math.min(RISK_CONFIG.scoreCap, rawScore);

  return {
    score,
    level: riskLevelFor(score),
    distanceKm,
    signals,
  };
}

/**
 * Loads up to 20 recent observations for an account, newest first. The account
 * ID must come from a trusted server-side context (e.g. an authenticated
 * session); never treat a client-supplied ID as proof of identity.
 */
export async function getPreviousObservations(accountId) {
  const validAccountId = assertValidAccountId(accountId);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select(OBSERVATION_FIELDS)
    .eq("account_id", validAccountId)
    .order("observed_at", { ascending: false })
    .limit(RISK_CONFIG.historyLimit);

  if (error) {
    throw new Error(
      `Failed to load previous IP/location observations: ${error.message}`
    );
  }

  return data ?? [];
}

/**
 * Persists a single IP/location observation. Geolocation fields are optional,
 * which allows failed lookups to be recorded without inventing coordinates.
 */
export async function saveIpLocationObservation(accountId, observation = {}) {
  const validAccountId = assertValidAccountId(accountId);

  const ipAddress = normalizeIp(observation.ip_address);
  if (!ipAddress) {
    throw new Error("Cannot save an observation without a valid ip_address.");
  }

  const latitude = toFiniteNumber(observation.latitude);
  const longitude = toFiniteNumber(observation.longitude);

  if ((latitude === null) !== (longitude === null)) {
    throw new Error(
      "Both latitude and longitude must be provided together, or both omitted."
    );
  }

  if (
    latitude !== null &&
    (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
  ) {
    throw new Error(
      "Coordinates are out of range (latitude -90..90, longitude -180..180)."
    );
  }

  let observedAt = observation.observed_at;
  if (observedAt === null || observedAt === undefined || observedAt === "") {
    observedAt = new Date().toISOString();
  } else {
    const parsed = Date.parse(observedAt);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid observed_at timestamp: ${observedAt}`);
    }
    observedAt = new Date(parsed).toISOString();
  }

  const row = {
    account_id: validAccountId,
    ip_address: ipAddress,
    country_code: nullableString(observation.country_code),
    region: nullableString(observation.region),
    city: nullableString(observation.city),
    latitude,
    longitude,
    asn: toNullableInteger(observation.asn),
    isp: nullableString(observation.isp),
    timezone: nullableString(observation.timezone),
    observed_at: observedAt,
    geo_provider: nullableString(observation.geo_provider),
    geo_lookup_success: Boolean(observation.geo_lookup_success),
  };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select(OBSERVATION_FIELDS)
    .single();

  if (error) {
    throw new Error(
      `Failed to save IP/location observation: ${error.message}`
    );
  }

  return data;
}

/**
 * End-to-end workflow: load history, pick the best baseline, assess the current
 * observation against it, then persist the current observation.
 *
 * The most recent observation with usable coordinates is used for geographic
 * comparison. The single most recent observation is preserved for IP/ASN/
 * timezone comparisons, so a failed geolocation lookup does not hide an IP
 * change.
 */
export async function assessCurrentLocation(accountId, currentObservation = {}) {
  const validAccountId = assertValidAccountId(accountId);

  const history = await getPreviousObservations(validAccountId);
  const latest = history[0] ?? null;
  const geographicBaseline = history.find(hasUsableCoordinates) ?? null;

  let baseline = null;
  if (latest) {
    baseline = { ...latest };
    if (!hasUsableCoordinates(latest) && geographicBaseline) {
      // Keep the latest observation's identity fields (IP, ASN, timezone)
      // while borrowing coordinates from the newest row that has them.
      baseline.latitude = geographicBaseline.latitude;
      baseline.longitude = geographicBaseline.longitude;
    }
  }

  const assessment = evaluateLocationRisk(baseline, currentObservation);
  const savedObservation = await saveIpLocationObservation(
    validAccountId,
    currentObservation
  );

  return {
    ...assessment,
    previousObservation: baseline,
    savedObservation,
  };
}

export { TABLE as IP_LOCATION_TABLE, USERS_TABLE };
