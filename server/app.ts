import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import { requestId, originGuard, fail, db, type AppConfig } from "./context.js";
import { authRouter } from "./routes/auth.js";
import { materialsRouter, storage } from "./routes/materials.js";
import { teacherRouter } from "./routes/teacher.js";

export function createApp(config?: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.get("/health/live", (_req, res) =>
    res.status(200).json({ status: "ok" }),
  );
  if (config) {
    app.use(express.json({ limit: "1mb" }));
    app.use(cookieParser(Buffer.from(config.jwtSecret).toString("base64")));
    app.use("/api/v1", originGuard(config));
    app.get("/api/v1/health", async (_req, res) => {
      const [database, objectStorage] = await Promise.allSettled([
        db.$queryRaw`SELECT 1`,
        (async () => {
          const { client, bucket } = storage();
          if (!(await client.bucketExists(bucket)))
            throw new Error("Bucket unavailable");
        })(),
      ]);
      const ready =
        database.status === "fulfilled" && objectStorage.status === "fulfilled";
      res
        .status(ready ? 200 : 503)
        .json({
          status: ready ? "ready" : "unavailable",
          dependencies: {
            database: database.status === "fulfilled" ? "ready" : "unavailable",
            storage:
              objectStorage.status === "fulfilled" ? "ready" : "unavailable",
            realtime: "not_configured",
            ai: "not_probed",
            video: "not_probed",
          },
        });
    });
    app.use("/api/v1/auth", authRouter(config));
    app.use("/api/v1", teacherRouter(config));
    app.use("/api/v1", materialsRouter(config));
  }
  const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => {
    fail(res, 500, "INTERNAL_ERROR", "Không thể hoàn thành yêu cầu");
  };
  app.use(errorHandler);
  return app;
}
