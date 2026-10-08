import { z } from "zod";

import { netsuiteRequest } from "../netsuite-client.js";

function toolResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: !result.ok,
  };
}

export function register(server) {
  server.registerTool(
    "netsuite_probe",
    {
      description:
        "Check whether a configured NetSuite read or write token is valid by requesting the REST metadata catalog for a single record type. Use this before a workflow to diagnose account, token, or permission problems without reading or changing business records.",
      inputSchema: {
        tokenRole: z.enum(["read", "write"]).default("write"),
        recordType: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/).default("customer"),
      },
    },
    async ({ tokenRole, recordType }) => {
      const response = await netsuiteRequest({
        method: "GET",
        path: `/record/v1/metadata-catalog/${encodeURIComponent(recordType)}`,
        tokenRole,
        extraHeaders: { Accept: "application/swagger+json" },
      });
      return toolResult({
        ok: response.ok,
        status: response.status,
        account: process.env.NETSUITE_ACCOUNT_ID,
        tokenRole,
        recordType,
      });
    },
  );
}
