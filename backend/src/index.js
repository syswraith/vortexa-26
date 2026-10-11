import express from "express";
import cors from "cors";
import { generateIpObservation } from "./services/generateIPLocation.js";
import { assessCurrentLocation } from "./services/ipLocationRisk.js";

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
    const { action, fp1, fp2, email, isBot } = req.body || {};
    let risk = null;
    try {
      risk = await generateIpObservation(req);
    } catch (riskErr) {
      console.warn("Could not generate IP risk for /auth:", riskErr.message);
    }

    res.json({
      ok: true,
      action: action || "login",
      reported: true,
      ipObservation: risk,
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
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;