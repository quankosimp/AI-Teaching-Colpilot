import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./context.js";
const port = Number(process.env.PORT ?? "3100");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535");
const config = loadConfig();
const host =
  config.mode === "local_mock" || config.mode === "test"
    ? "127.0.0.1"
    : "0.0.0.0";
createApp(config).listen(port, host, () =>
  console.log(`Server listening on ${host}:${port}`),
);
