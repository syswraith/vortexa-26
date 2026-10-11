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
      "/auth/update-password"
    ],
  });
});

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(3000, "localhost", () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
