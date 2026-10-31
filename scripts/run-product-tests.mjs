import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return discover(path);
      return entry.isFile() && /\.test\.[cm]?[jt]sx?$/.test(entry.name)
        ? [path]
        : [];
    }),
  );
  return files.flat();
}

const files = (await discover("tests")).sort();
if (files.length === 0) {
  console.error("No test files found under tests/.");
  process.exitCode = 1;
} else {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", ...files],
    { stdio: "inherit" },
  );
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
  });
}
