import express from "express";
import cors from "cors";
import { generateIpObservation } from "./services/generateIPLocation.js";
import { assessCurrentLocation } from "./services/ipLocationRisk.js";
import { getSupabaseClient } from "./lib/supabase.js";

const app = express();
const port = process.env.PORT || 3000;

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());

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
    endpoints: ["/", "/health", "/test", "/auth"],
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
        }
      } catch (tokenErr) {
        console.warn("Could not verify access token:", tokenErr.message);
      }
    }

    let risk = null;
    let assessment = null;
    try {
      if (userId) {
        // For authenticated users: generate observation, assess risk, and save to DB
        const result = await generateAndAssessIpRisk(req, userId);
        risk = result.observation;
        assessment = result.assessment;
        console.log(assessment)
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
      assessment,
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

// Friendly JSON 404 handler for unrecognized routes
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: ["/", "/health", "/test", "/auth"],
  });
});

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(3000, "localhost", () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
