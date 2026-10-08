import { z } from "zod";

import { netsuiteRequest } from "../netsuite-client.js";

const tokenRoleSchema = z.enum(["read", "write"]);
const recordTypeSchema = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, "recordType contains invalid characters");

function toolResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: !result.ok,
  };
}

function recordPath(recordType, id) {
  const base = `/record/v1/${encodeURIComponent(recordType)}`;
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`;
}

function newRecordId(location) {
  if (!location) return null;
  try {
    return new URL(location, "https://netsuite.invalid").pathname.split("/").filter(Boolean).at(-1) ?? null;
  } catch {
    return location.split("/").filter(Boolean).at(-1) ?? null;
  }
}

export function register(server) {
  server.registerTool(
    "netsuite_get_record",
    {
      description:
        "Read any NetSuite REST record by record type and internal ID. Use REST record type names, not SuiteQL table names: item records are inventoryItem, assemblyItem, noninventorySaleItem, noninventoryPurchaseItem, noninventoryResaleItem, serviceSaleItem, servicePurchaseItem, kitItem, or discountItem (there is no plain 'item' or 'nonInventoryItem'); other common types are customer, vendor, salesOrder, purchaseOrder, invoice. Optionally read a sub-resource such as /price or /price/1 when a sublist view only returns stub rows, and optionally expand embedded sub-resources.",
      inputSchema: {
        recordType: recordTypeSchema,
        id: z.string().min(1),
        subPath: z
          .string()
          .regex(
            /^\/[A-Za-z0-9_~-]+(?:\/[A-Za-z0-9_~-]+)*$/,
            "subPath must start with / and contain only path segments",
          )
          .optional(),
        expandSubResources: z.boolean().optional(),
        tokenRole: tokenRoleSchema.default("write"),
      },
    },
    async ({ recordType, id, subPath, expandSubResources, tokenRole }) =>
      toolResult(
        await netsuiteRequest({
          method: "GET",
          path: `${recordPath(recordType, id)}${subPath ?? ""}`,
          query: expandSubResources === undefined ? undefined : { expandSubResources },
          tokenRole,
        }),
      ),
  );

  server.registerTool(
    "netsuite_create_record",
    {
      description:
        "Create any NetSuite REST record, including inventory items, from a caller-supplied JSON body. Defaults to a no-network dry run; pass dryRun=false explicitly only after reviewing the exact POST payload.",
      inputSchema: {
        recordType: recordTypeSchema,
        body: z.record(z.string(), z.unknown()),
        dryRun: z.boolean().default(true),
        tokenRole: tokenRoleSchema.default("write"),
      },
    },
    async ({ recordType, body, dryRun, tokenRole }) => {
      const path = recordPath(recordType);
      if (dryRun) {
        return toolResult({ ok: true, dryRun: true, wouldPost: { method: "POST", path, body } });
      }

      const response = await netsuiteRequest({ method: "POST", path, body, tokenRole });
      return toolResult({ ...response, newId: response.ok ? newRecordId(response.location) : null });
    },
  );

  server.registerTool(
    "netsuite_update_record",
    {
      description:
        "Partially update any NetSuite REST record by record type and internal ID using PATCH. Defaults to a no-network dry run; pass dryRun=false explicitly only after reviewing the exact PATCH payload.",
      inputSchema: {
        recordType: recordTypeSchema,
        id: z.string().min(1),
        body: z.record(z.string(), z.unknown()),
        dryRun: z.boolean().default(true),
        tokenRole: tokenRoleSchema.default("write"),
      },
    },
    async ({ recordType, id, body, dryRun, tokenRole }) => {
      const path = recordPath(recordType, id);
      if (dryRun) {
        return toolResult({ ok: true, dryRun: true, wouldPatch: { method: "PATCH", path, body } });
      }

      return toolResult(await netsuiteRequest({ method: "PATCH", path, body, tokenRole }));
    },
  );
}
