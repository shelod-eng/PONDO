const { spawn } = require("child_process");
const http = require("http");

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
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

function runNpm(name, npmArgs) {
  if (process.platform === "win32") {
    return run(name, "cmd.exe", ["/d", "/s", "/c", `npm ${npmArgs.join(" ")}`]);
  }
  return run(name, "npm", npmArgs);
}

function isPort3000ServingNext() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 3000,
        path: "/",
        method: "GET",
        timeout: 800,
      },
      (res) => {
        const poweredBy = String(res.headers["x-powered-by"] || "").toLowerCase();
        resolve(poweredBy.includes("next"));
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

function isPort4100ServingApi() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 4100,
        path: "/healthz",
        method: "GET",
        timeout: 800,
      },
      (res) => resolve(res.statusCode === 200),
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
let web = null;

function shutdown() {
  if (api && !api.killed) api.kill("SIGTERM");
  if (web && !web.killed) web.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  const apiAlreadyRunning = await isPort4100ServingApi();
  if (apiAlreadyRunning) {
    console.log("[api] Reusing existing API server on http://localhost:4100");
  } else {
    api = runNpm("api", ["--workspace", "api", "run", "dev"]);
  }

  const webAlreadyRunning = await isPort3000ServingNext();
  if (webAlreadyRunning) {
    console.log("[web] Reusing existing Next dev server on http://localhost:3000");
    return;
  }

  web = runNpm("web", ["--workspace", "web", "run", "dev"]);
}

main().catch((err) => {
  console.error("[dev-web-with-api] failed to start:", err);
  process.exit(1);
});
