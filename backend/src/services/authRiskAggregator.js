import { getSupabaseClient } from "../lib/supabase.js";

const TABLE = "auth_risk_assessments";

const AUTH_RISK_CONFIG = {
  weights: {
    IP_LOCATION: 0.55,
    FINGERPRINT: 0.45,
  },
  levelThresholds: {
    low: 25,
    review: 50,
    high: 75,
  },
};

export function calculateTotalScore(ipLocationScore, fingerprintScore) {
  const { weights } = AUTH_RISK_CONFIG;
  const total = Math.round(
    (ipLocationScore || 0) * weights.IP_LOCATION +
    (fingerprintScore || 0) * weights.FINGERPRINT
  );
  return Math.min(100, Math.max(0, total));
}

export function scoreToLevel(score) {
  const { levelThresholds } = AUTH_RISK_CONFIG;
  if (score >= levelThresholds.high) return "critical";
  if (score >= levelThresholds.review) return "high";
  if (score >= levelThresholds.low) return "review";
  return "low";
}

export function getRiskAction(level) {
  switch (level) {
    case "low": return "allow";
    case "review": return "allow";
    case "high": return "require_mfa";
    case "critical": return "block";
    default: return "allow";
  }
}

export async function saveAuthRiskAssessment(assessment) {
  const supabase = getSupabaseClient();

  const row = {
    account_id: assessment.account_id,
    login_attempt_id: assessment.login_attempt_id || undefined,
    ip_location_score: assessment.ip_location_score ?? 0,
    fingerprint_score: assessment.fingerprint_score ?? 0,
    total_score: assessment.total_score ?? 0,
    risk_level: assessment.risk_level || "low",
    action: assessment.action || "login",
    user_agent: assessment.user_agent || null,
    ip_address: assessment.ip_address || null,
    ip_json: assessment.ip_json ?? {},
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save auth risk assessment: ${error.message}`);
  }

  return data;
}

export async function getRecentAssessments(accountId, limit = 10) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load recent assessments: ${error.message}`);
  }

  return data ?? [];
}

export async function assessAuthRisk({ ipAssessment, fpResult, action, userAgent, ipAddress, accountId }) {
  const ipLocationScore = ipAssessment?.score ?? 0;
  const fingerprintScore = fpResult?.score ?? 0;

  const totalScore = calculateTotalScore(ipLocationScore, fingerprintScore);
  const riskLevel = scoreToLevel(totalScore);
  const recommendedAction = getRiskAction(riskLevel);

  const breakdown = {
    ip_location: {
      score: ipLocationScore,
      weight: AUTH_RISK_CONFIG.weights.IP_LOCATION,
      contribution: Math.round(ipLocationScore * AUTH_RISK_CONFIG.weights.IP_LOCATION),
      signals: ipAssessment?.signals ?? [],
      level: ipAssessment?.level ?? "normal",
    },
    fingerprint: {
      score: fingerprintScore,
      weight: AUTH_RISK_CONFIG.weights.FINGERPRINT,
      contribution: Math.round(fingerprintScore * AUTH_RISK_CONFIG.weights.FINGERPRINT),
      signals: fpResult?.signals ?? [],
      level: fpResult?.level ?? "review",
      matchedFingerprint: fpResult?.matchedFingerprint ?? null,
      isNewDevice: fpResult?.isNewDevice ?? true,
    },
  };

  const result = {
    totalScore,
    riskLevel,
    recommendedAction,
    breakdown,
    action,
    userAgent,
    ipAddress,
  };

  if (accountId) {
    await saveAuthRiskAssessment({
      account_id: accountId,
      ip_location_score: ipLocationScore,
      fingerprint_score: fingerprintScore,
      total_score: totalScore,
      risk_level: riskLevel,
      action,
      user_agent: userAgent,
      ip_address: ipAddress,
      ip_json: ipAssessment ?? {},
    });
  }

  return result;
}

export { TABLE as AUTH_RISK_ASSESSMENTS_TABLE, AUTH_RISK_CONFIG };