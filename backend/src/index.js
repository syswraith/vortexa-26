import express from "express";
import cors from "cors";
import { generateIpObservation } from "./services/generateIPLocation.js";
import { assessCurrentLocation } from "./services/ipLocationRisk.js";
import { evaluateFingerprintRisk, saveOrUpdateFingerprint, promoteFingerprintTrust, getUserFingerprints } from "./services/fingerprintRisk.js";
import { assessAuthRisk } from "./services/authRiskAggregator.js";
import { getSupabaseClient } from "./lib/supabase.js";

function decodeJwtPart(token, index) {
  try {
    const part = token.split(".")[index];
    if (!part) return null;
    const json = Buffer.from(
      part.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function describeTokenFailure(accessToken, error) {
  const header = decodeJwtPart(accessToken, 0);
  const claims = decodeJwtPart(accessToken, 1);
  const expIso = claims?.exp ? new Date(claims.exp * 1000).toISOString() : "unknown";
  const expired = claims?.exp ? Date.now() >= claims.exp * 1000 : "unknown";

  return [
    error?.message || error || "unknown error",
    error?.status ? `status=${error.status}` : null,
    claims
      ? `iss=${claims.iss ?? "?"} aud=${claims.aud ?? "?"} exp=${expIso} expired=${expired}`
      : "no-decodable-claims",
    header?.kid ? `kid=${header.kid}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

const app = express();
const port = process.env.PORT || 3000;

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export async function generateAndAssessIpRisk(req, userId) {
  const observation = await generateIpObservation(req);

  const assessment = await assessCurrentLocation(
    userId,
    observation
  );

  return {
    observation,
    assessment,
  };
}

// Root endpoint: API health & discovery
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "vortexa-backend",
    message: "Vortexa backend API is running",
    endpoints: [
      "/",
      "/health",
      "/test",
      "/auth",
      "/auth/update-email",
      "/auth/update-password",
      "/update-email",
      "/update-password"
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/test", async (req, res) => {
  try {
    const result = await generateAndAssessIpRisk(
      req,
      "62bc3299-b316-4307-b40a-d7a88327ffbd"
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auth reporting endpoint used by frontend
app.post("/auth", async (req, res) => {
  try {
    const { action, fp1, fp2, email, isBot, accessToken } = req.body || {};
    
    let userId = null;
    if (accessToken) {
      try {
        const supabase = getSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (!error && user) {
          userId = user.id;
        } else if (error) {
          console.warn("Could not verify access token:", describeTokenFailure(accessToken, error));
        }
      } catch (tokenErr) {
        console.warn("Could not verify access token:", describeTokenFailure(accessToken, tokenErr));
      }
    }

    let risk = null;
    let ipAssessment = null;
    let fpResult = null;
    let combinedAssessment = null;

    try {
      if (userId) {
        // 1. IP Location Risk
        const ipResult = await generateAndAssessIpRisk(req, userId);
        risk = ipResult.observation;
        ipAssessment = ipResult.assessment;

        // 2. Fingerprint Risk
        const fingerprints = await getUserFingerprints(userId);
        fpResult = evaluateFingerprintRisk(userId, fp1, fp2, fingerprints);
        
        // Save/update fingerprint
        await saveOrUpdateFingerprint(userId, fp1, fp2, req.headers['user-agent']);

        // 3. Combined Risk Assessment
        combinedAssessment = await assessAuthRisk({
          ipAssessment,
          fpResult,
          action: action || "login",
          userAgent: req.headers['user-agent'],
          ipAddress: risk?.ip_address,
          accountId: userId,
        });
      } else {
        // For unauthenticated requests: just generate observation (no DB save)
        risk = await generateIpObservation(req);
      }
    } catch (riskErr) {
      console.warn("Could not generate IP risk for /auth:", riskErr.message);
    }

    res.json({
      ok: true,
      action: action || "login",
      reported: true,
      ipObservation: risk,
      ipAssessment,
      fingerprintAssessment: fpResult,
      assessment: combinedAssessment,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/auth", (req, res) => {
  res.json({
    status: "ok",
    message: "POST to /auth with action, email, password, and fingerprints",
  });
});

// API endpoint to update email in both auth.users and public."Users"
app.post("/auth/update-email", async (req, res) => {
  try {
    const { userId, email } = req.body || {};
    if (!userId || !email) {
      return res.status(400).json({ error: "userId and email are required" });
    }

    const supabase = getSupabaseClient();

    // 1. Update Supabase Auth user (confirmed immediately)
    const { error: authError } = await supabase.auth.admin.updateUserById(
      userId,
      { email, email_confirm: true }
    );
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // 2. Update public."Users" table
    const { error: dbError } = await supabase
      .from("Users")
      .update({ email })
      .eq("uid", userId);

    if (dbError) {
      console.warn("Failed to update public.Users table:", dbError.message);
    }

    res.json({
      ok: true,
      message: "Email updated successfully in database and auth.",
    });
  } catch (error) {
    console.error("Error in /auth/update-email:", error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to update password in auth.users
app.post("/auth/update-password", async (req, res) => {
  try {
    const { userId, password } = req.body || {};
    if (!userId || !password) {
      return res.status(400).json({ error: "userId and password are required" });
    }

    const supabase = getSupabaseClient();
    const { error: authError } = await supabase.auth.admin.updateUserById(
      userId,
      { password }
    );
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    res.json({
      ok: true,
      message: "Password updated successfully in database and auth.",
    });
  } catch (error) {
    console.error("Error in /auth/update-password:", error);
    res.status(500).json({ error: error.message });
  }
});

function getAccessToken(req) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  if (typeof req.query.accessToken === "string") {
    return req.query.accessToken;
  }
  return "";
}

// Risk assessments endpoint - returns all users' assessments with pagination and filters
app.get("/api/risk-assessments", async (req, res) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return res.status(401).json({ error: "accessToken required" });
    }

    let userId = null;
    try {
      const supabase = getSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (!error && user) {
        userId = user.id;
      } else if (error) {
        console.warn("Could not verify access token:", describeTokenFailure(accessToken, error));
      }
    } catch (tokenErr) {
      console.warn("Could not verify access token:", describeTokenFailure(accessToken, tokenErr));
    }

    if (!userId) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const {
      risk_level,
      action,
      date_from,
      date_to,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const supabase = getSupabaseClient();
    let query = supabase
      .from("auth_risk_assessments")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (risk_level && risk_level !== "all") {
      query = query.eq("risk_level", risk_level);
    }
    if (action && action !== "all") {
      query = query.eq("action", action);
    }
    if (date_from) {
      query = query.gte("created_at", date_from);
    }
    if (date_to) {
      query = query.lte("created_at", date_to + "T23:59:59.999Z");
    }
    if (search) {
      const safeSearch = String(search).replace(/[%_,.()]/g, "").trim();
      if (safeSearch) {
        query = query.or(
          `ip_address.ilike.%${safeSearch}%,account_id.ilike.%${safeSearch}%,login_attempt_id.ilike.%${safeSearch}%`
        );
      }
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch assessments: ${error.message}`);
    }

    res.json({
      data: data ?? [],
      total: count ?? 0,
      page: pageNum,
      pageSize: limitNum,
      totalPages: Math.ceil((count ?? 0) / limitNum),
    });
  } catch (error) {
    console.error("Error fetching risk assessments:", error);
    res.status(500).json({ error: error.message });
  }
});

// Friendly JSON 404 handler for unrecognized routes
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: [
      "/",
      "/health",
      "/test",
      "/auth",
      "/auth/update-email",
      "/auth/update-password",
      "/api/risk-assessments"
    ],
  });
});

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(3000, "localhost", () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
