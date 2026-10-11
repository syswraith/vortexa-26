import express from "express";
import cors from "cors";
import { generateIpObservation } from "./services/generateIPLocation.js";
import { assessCurrentLocation } from "./services/ipLocationRisk.js";

const app = express();
const api = express.Router();

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

api.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

api.get("/test", async (req, res) => {
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

app.use("/api", api);

export default app;

if (process.env.VERCEL !== "1") {
  const port = process.env.PORT || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}
