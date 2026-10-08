import { spawn } from "node:child_process";

const env = {
  ...process.env,
  NETSUITE_ACCOUNT_ID: "1234567-sb1",
  NETSUITE_CONSUMER_KEY: "smoke-consumer-key",
  NETSUITE_CONSUMER_SECRET: "smoke-consumer-secret",
  NETSUITE_TBA_TOKEN_ID_READ: "smoke-read-id",
  NETSUITE_TBA_TOKEN_SECRET_READ: "smoke-read-secret",
  NETSUITE_TBA_TOKEN_ID_WRITE: "smoke-write-id",
  NETSUITE_TBA_TOKEN_SECRET_WRITE: "smoke-write-secret",
};

const child = spawn(process.execPath, ["src/index.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
let settled = false;

const timer = setTimeout(() => {
  if (settled) return;
  settled = true;
  child.kill("SIGKILL");
  console.error("smoke test timed out waiting for server startup");
  process.exit(1);
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk;
  if (stderr.includes("netsuite-mcp account=1234567-sb1 tokenRoles=read,write")) {
    settled = true;
    clearTimeout(timer);
    child.kill("SIGKILL");
    console.log("smoke ok: server started with read,write token roles");
    process.exit(0);
  }
});

child.on("exit", (code) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  console.error(`smoke test failed: server exited early with code ${code}\n${stderr}`);
  process.exit(1);
});
