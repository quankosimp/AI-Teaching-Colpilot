import express from "express";

// Liveness only: this endpoint does not claim that dependencies are ready.
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  return app;
}
