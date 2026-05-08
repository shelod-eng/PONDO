const fs = require("fs");
const path = require("path");

const rootNextDir = path.join(process.cwd(), ".next");
const workspaceNextDir = path.join(process.cwd(), "web", ".next");

if (!fs.existsSync(workspaceNextDir)) {
  console.error(`[sync-next-output] Missing workspace build output at ${workspaceNextDir}`);
  process.exit(1);
}

fs.rmSync(rootNextDir, { recursive: true, force: true });
fs.cpSync(workspaceNextDir, rootNextDir, { recursive: true });

console.log(`[sync-next-output] Copied ${workspaceNextDir} -> ${rootNextDir}`);
