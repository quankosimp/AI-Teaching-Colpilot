import http from "node:http";
import { SessionConflict } from "./sessionLock.js";
import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import { requestId, originGuard, fail, db, type AppConfig } from "./context.js";
import { attachClassroomRealtime } from "./realtime.js";
import { aiRouter } from "./routes/ai.js";
import { activeAIProvider, isAIConfigured } from "./ai/index.js";
import { authRouter } from "./routes/auth.js";
import { classroomRouter } from "./routes/classroom.js";
import { classesRouter } from "./routes/classes.js";
import { classRoomsRouter } from "./routes/classRooms.js";
import { materialsRouter, storage } from "./routes/materials.js";
import { reviewRouter } from "./routes/review.js";
import { teacherRouter } from "./routes/teacher.js";

export function createApp(config?: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.get("/health/live", (_req, res) =>
    res.status(200).json({ status: "ok" }),
  );
  if (config) {
    let realtimeReady = false;
    app.use(express.json({ limit: "1mb" }));
    app.use(cookieParser(Buffer.from(config.jwtSecret).toString("base64")));
    app.use("/api/v1", originGuard(config));
    app.get("/api/v1/health", async (_req, res) => {
      const [database, objectStorage, realtimeFailures] =
        await Promise.allSettled([
          db.$queryRaw`SELECT 1`,
          (async () => {
            const { client, bucket } = storage();
            if (!(await client.bucketExists(bucket)))
              throw new Error("Bucket unavailable");
          })(),
          db.sessionEventOutbox.count({
            where: { publishedAt: null, publicationAttempts: { gt: 0 } },
          }),
        ]);
      const ready =
        database.status === "fulfilled" && objectStorage.status === "fulfilled";
      res.status(ready ? 200 : 503).json({
        status: ready ? "degraded" : "unavailable",
        dependencies: {
          database: database.status === "fulfilled" ? "ready" : "unavailable",
          storage:
            objectStorage.status === "fulfilled" ? "ready" : "unavailable",
          realtime: realtimeReady ? "ready" : "not_configured",
          realtimePendingFailures:
            realtimeFailures.status === "fulfilled"
              ? realtimeFailures.value
              : null,
          ai: {
            enabled: process.env.ENABLE_AI === "true",
            configured: isAIConfigured(),
            provider: activeAIProvider(),
            probe: "not_run",
          },
          video: {
            configured: !!(
              process.env.ZOOM_SDK_KEY && process.env.ZOOM_SDK_SECRET
            ),
            probe: "not_run",
          },
        },
      });
    });
    app.use("/api/v1/auth", authRouter(config));
    app.use("/api/v1", classroomRouter(config));
    app.use("/api/v1", classesRouter(config));
    app.use("/api/v1", classRoomsRouter(config));
    app.use("/api/v1", reviewRouter(config));
    app.use("/api/v1", teacherRouter(config));
    app.use("/api/v1", materialsRouter(config));
    app.use("/api/v1", aiRouter(config));

    const originalListen = app.listen.bind(app);
    app.listen = ((...args: Parameters<typeof originalListen>) => {
      const httpServer = http.createServer(app);
      const realtime = attachClassroomRealtime(httpServer, config);
      const origClose = httpServer.close.bind(httpServer);
      httpServer.close = ((cb?: (err?: Error) => void) => {
        realtime.shutdown();
        httpServer.closeIdleConnections?.();
        httpServer.closeAllConnections?.();
        return origClose(cb);
      }) as typeof httpServer.close;
      realtimeReady = true;
      return httpServer.listen(...args);
    }) as typeof app.listen;
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof SessionConflict)
      return void fail(
        res,
        error.code === "VALIDATION_ERROR"
          ? 400
          : error.code === "PERMISSION_DENIED"
            ? 403
            : 409,
        error.code,
        error.message,
      );
    fail(res, 500, "INTERNAL_ERROR", "Không thể hoàn thành yêu cầu");
  };
  app.use(errorHandler);
  return app;
}
