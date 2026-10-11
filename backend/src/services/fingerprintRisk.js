import { getSupabaseClient } from "../lib/supabase.js";

const TABLE = "device_fingerprints";

const FP_CONFIG = {
  trustedThreshold: 3,
  scoreDecayPerSuccess: 10,
  baseScores: {
    EXACT_MATCH_NEW: 25,
    EXACT_MATCH_SEEN: 15,
    EXACT_MATCH_TRUSTED: 0,
    PARTIAL_MATCH_NEW: 40,
    PARTIAL_MATCH_SEEN: 30,
    PARTIAL_MATCH_TRUSTED: 10,
    KNOWN_NOT_TRUSTED: 50,
    NEW_DEVICE: 50,
    MISMATCH_HIGH_CONFIDENCE: 75,
  },
};

function normalizeFp(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function assertValidAccountId(accountId) {
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof accountId !== "string" || !UUID_PATTERN.test(accountId.trim())) {
    throw new Error(`Invalid account ID: expected a UUID, received ${JSON.stringify(accountId)}.`);
  }
  return accountId.trim();
}

export async function getUserFingerprints(accountId) {
  const validAccountId = assertValidAccountId(accountId);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", validAccountId)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load fingerprints: ${error.message}`);
  }

  return data ?? [];
}

export function evaluateFingerprintRisk(accountId, currentFp1, currentFp2, fingerprints = []) {
  const fp1 = normalizeFp(currentFp1);
  const fp2 = normalizeFp(currentFp2);

  if (!fp1 && !fp2) {
    return {
      score: FP_CONFIG.baseScores.NEW_DEVICE,
      level: "review",
      signals: [{ rule: "NO_FINGERPRINT", points: FP_CONFIG.baseScores.NEW_DEVICE, details: "No fingerprint provided" }],
      matchedFingerprint: null,
      isNewDevice: true,
    };
  }

  const signals = [];
  let matchedFingerprint = null;
  let isNewDevice = true;

  for (const fp of fingerprints) {
    const storedFp1 = normalizeFp(fp.fp1);
    const storedFp2 = normalizeFp(fp.fp2);

    const fp1Match = fp1 && storedFp1 && fp1 === storedFp1;
    const fp2Match = fp2 && storedFp2 && fp2 === storedFp2;

    if (fp1Match || fp2Match) {
      isNewDevice = false;
      matchedFingerprint = fp;

      if (fp1Match && fp2Match) {
        if (fp.trust_level === "trusted") {
          signals.push({ rule: "FINGERPRINT_EXACT_TRUSTED", points: FP_CONFIG.baseScores.EXACT_MATCH_TRUSTED, details: "Exact match with trusted device" });
        } else if (fp.seen_count >= FP_CONFIG.trustedThreshold) {
          signals.push({ rule: "FINGERPRINT_EXACT_SEEN", points: FP_CONFIG.baseScores.EXACT_MATCH_SEEN, details: `Exact match, seen ${fp.seen_count} times` });
        } else {
          signals.push({ rule: "FINGERPRINT_EXACT_NEW", points: FP_CONFIG.baseScores.EXACT_MATCH_NEW, details: "Exact match with new device" });
        }
      } else {
        if (fp.trust_level === "trusted") {
          signals.push({ rule: "FINGERPRINT_PARTIAL_TRUSTED", points: FP_CONFIG.baseScores.PARTIAL_MATCH_TRUSTED, details: "Partial match with trusted device" });
        } else if (fp.seen_count >= FP_CONFIG.trustedThreshold) {
          signals.push({ rule: "FINGERPRINT_PARTIAL_SEEN", points: FP_CONFIG.baseScores.PARTIAL_MATCH_SEEN, details: `Partial match, seen ${fp.seen_count} times` });
        } else {
          signals.push({ rule: "FINGERPRINT_PARTIAL_NEW", points: FP_CONFIG.baseScores.PARTIAL_MATCH_NEW, details: "Partial match with new device" });
        }
      }
      break;
    }
  }

  if (isNewDevice) {
    signals.push({ rule: "FINGERPRINT_NEW_DEVICE", points: FP_CONFIG.baseScores.NEW_DEVICE, details: "No matching fingerprint found" });
  } else if (matchedFingerprint && matchedFingerprint.trust_level === "suspicious") {
    signals.push({ rule: "FINGERPRINT_SUSPICIOUS", points: 20, details: "Device marked as suspicious" });
  } else if (matchedFingerprint && matchedFingerprint.trust_level === "blocked") {
    signals.push({ rule: "FINGERPRINT_BLOCKED", points: 100, details: "Device blocked" });
  }

  const rawScore = signals.reduce((total, s) => total + s.points, 0);
  const score = Math.min(100, Math.max(0, rawScore));

  let level = "low";
  if (score >= 75) level = "critical";
  else if (score >= 50) level = "high";
  else if (score >= 25) level = "review";

  return {
    score,
    level,
    signals,
    matchedFingerprint,
    isNewDevice,
  };
}

export async function saveOrUpdateFingerprint(accountId, fp1, fp2, userAgent) {
  const validAccountId = assertValidAccountId(accountId);
  const supabase = getSupabaseClient();

  const normalizedFp1 = normalizeFp(fp1);
  const normalizedFp2 = normalizeFp(fp2);

  if (!normalizedFp1 && !normalizedFp2) {
    return null;
  }

  const { data: existing, error: selectError } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", validAccountId)
    .eq("fp1", normalizedFp1 ?? "")
    .eq("fp2", normalizedFp2 ?? "")
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to check existing fingerprint: ${selectError.message}`);
  }

  const now = new Date().toISOString();
  const label = extractDeviceLabel(userAgent);

  if (existing) {
    const newSeenCount = (existing.seen_count || 1) + 1;
    let newTrustLevel = existing.trust_level;

    if (newTrustLevel === "unknown" && newSeenCount >= FP_CONFIG.trustedThreshold) {
      newTrustLevel = "trusted";
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update({
        last_seen_at: now,
        seen_count: newSeenCount,
        trust_level: newTrustLevel,
        label: label || existing.label,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update fingerprint: ${error.message}`);
    }
    return data;
  } else {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        account_id: validAccountId,
        fp1: normalizedFp1,
        fp2: normalizedFp2,
        label,
        trust_level: "unknown",
        first_seen_at: now,
        last_seen_at: now,
        seen_count: 1,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert fingerprint: ${error.message}`);
    }
    return data;
  }
}

export async function promoteFingerprintTrust(accountId, fp1, fp2) {
  const validAccountId = assertValidAccountId(accountId);
  const supabase = getSupabaseClient();

  const normalizedFp1 = normalizeFp(fp1);
  const normalizedFp2 = normalizeFp(fp2);

  if (!normalizedFp1 && !normalizedFp2) {
    return null;
  }

  const { data: existing, error: selectError } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", validAccountId)
    .eq("fp1", normalizedFp1 ?? "")
    .eq("fp2", normalizedFp2 ?? "")
    .maybeSingle();

  if (selectError || !existing) {
    return null;
  }

  if (existing.trust_level === "trusted") {
    return existing;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ trust_level: "trusted" })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to promote fingerprint trust: ${error.message}`);
  }
  return data;
}

export async function markFingerprintSuspicious(accountId, fp1, fp2) {
  const validAccountId = assertValidAccountId(accountId);
  const supabase = getSupabaseClient();

  const normalizedFp1 = normalizeFp(fp1);
  const normalizedFp2 = normalizeFp(fp2);

  if (!normalizedFp1 && !normalizedFp2) {
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ trust_level: "suspicious" })
    .eq("account_id", validAccountId)
    .eq("fp1", normalizedFp1 ?? "")
    .eq("fp2", normalizedFp2 ?? "")
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark fingerprint suspicious: ${error.message}`);
  }
  return data;
}

export async function markFingerprintBlocked(accountId, fp1, fp2) {
  const validAccountId = assertValidAccountId(accountId);
  const supabase = getSupabaseClient();

  const normalizedFp1 = normalizeFp(fp1);
  const normalizedFp2 = normalizeFp(fp2);

  if (!normalizedFp1 && !normalizedFp2) {
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ trust_level: "blocked" })
    .eq("account_id", validAccountId)
    .eq("fp1", normalizedFp1 ?? "")
    .eq("fp2", normalizedFp2 ?? "")
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark fingerprint blocked: ${error.message}`);
  }
  return data;
}

function extractDeviceLabel(userAgent) {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  let browser = "Unknown";
  let os = "Unknown";

  if (ua.includes("chrome") && !ua.includes("edg")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("edg")) browser = "Edge";

  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os") || ua.includes("macos")) os = "macOS";
  else if (ua.includes("linux")) os = "Linux";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";

  return `${browser} on ${os}`;
}

export { TABLE as DEVICE_FINGERPRINTS_TABLE, FP_CONFIG };