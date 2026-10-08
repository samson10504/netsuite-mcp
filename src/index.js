#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { register as registerInventoryAdjustments } from "./tools/inventory-adjustments.js";
import { register as registerQuery } from "./tools/query.js";
import { register as registerRecords } from "./tools/records.js";
import { register as registerSystem } from "./tools/system.js";

async function loadLocalEnv() {
  if (process.env.NETSUITE_ACCOUNT_ID) return;
  let contents;
  try {
    contents = await readFile(".env", "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(?:"(.*)"|'(.*)')$/, (_, double, single) => double ?? single);
    process.env[match[1]] = value;
  }
}

function validateConfiguration() {
  const required = ["NETSUITE_ACCOUNT_ID", "NETSUITE_CONSUMER_KEY", "NETSUITE_CONSUMER_SECRET"];
  const missing = required.filter((name) => !process.env[name]);
  const roles = ["READ", "WRITE"];
  const configuredRoles = [];

  for (const role of roles) {
    const idName = `NETSUITE_TBA_TOKEN_ID_${role}`;
    const secretName = `NETSUITE_TBA_TOKEN_SECRET_${role}`;
    const hasId = Boolean(process.env[idName]);
    const hasSecret = Boolean(process.env[secretName]);
    if (hasId && hasSecret) configuredRoles.push(role.toLowerCase());
    if (hasId !== hasSecret) missing.push(hasId ? secretName : idName);
  }

  if (configuredRoles.length === 0 && !roles.some((role) =>
    process.env[`NETSUITE_TBA_TOKEN_ID_${role}`] || process.env[`NETSUITE_TBA_TOKEN_SECRET_${role}`],
  )) {
    missing.push(
      "one complete token pair: NETSUITE_TBA_TOKEN_ID_READ + NETSUITE_TBA_TOKEN_SECRET_READ, or NETSUITE_TBA_TOKEN_ID_WRITE + NETSUITE_TBA_TOKEN_SECRET_WRITE",
    );
  }

  if (missing.length > 0) throw new Error(`Missing required NetSuite configuration: ${missing.join(", ")}`);
  if (!/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(process.env.NETSUITE_ACCOUNT_ID)) {
    throw new Error("Invalid NETSUITE_ACCOUNT_ID format");
  }
  return configuredRoles;
}

async function main() {
  await loadLocalEnv();
  const configuredRoles = validateConfiguration();
  console.error(
    `netsuite-mcp account=${process.env.NETSUITE_ACCOUNT_ID} tokenRoles=${configuredRoles.join(",")}`,
  );

  const server = new McpServer({ name: "netsuite-mcp", version: "0.1.1" });
  registerSystem(server);
  registerQuery(server);
  registerRecords(server);
  registerInventoryAdjustments(server);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(`netsuite-mcp failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
