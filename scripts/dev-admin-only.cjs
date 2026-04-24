const { spawn } = require("child_process");
const http = require("http");

function run(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`);
      return;
    }
    if (code && code !== 0) {
      console.log(`[${name}] exited with code ${code}`);
    }
  });

  return child;
}

function runNpm(name, npmArgs, extraEnv = {}) {
  if (process.platform === "win32") {
    return run(name, "cmd.exe", ["/d", "/s", "/c", `npm ${npmArgs.join(" ")}`], extraEnv);
  }
  return run(name, "npm", npmArgs, extraEnv);
}

function isPortServing(path, port, expected) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        timeout: 800,
      },
      (res) => {
        const poweredBy = String(res.headers["x-powered-by"] || "").toLowerCase();
        resolve(expected === "api" ? res.statusCode === 200 : poweredBy.includes("next"));
      },
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

let api = null;
let admin = null;

function shutdown() {
  if (api && !api.killed) api.kill("SIGTERM");
  if (admin && !admin.killed) admin.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  const apiAlreadyRunning = await isPortServing("/healthz", 4100, "api");
  if (apiAlreadyRunning) {
    console.log("[api] Reusing existing API server on http://localhost:4100");
  } else {
    api = runNpm("api", ["--workspace", "api", "run", "dev"]);
  }

  const adminAlreadyRunning = await isPortServing("/", 3001, "next");
  if (adminAlreadyRunning) {
    console.log("[admin] Reusing existing admin dev server on http://localhost:3001");
    return;
  }

  admin = runNpm("admin", ["--workspace", "web", "run", "dev", "--", "--port", "3001"], {
    PONDO_ADMIN_MODE: "true",
  });
}

main().catch((err) => {
  console.error("[dev-admin-only] failed to start:", err);
  process.exit(1);
});
