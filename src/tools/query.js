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
    "netsuite_suiteql",
    {
      description:
        "Run one read-only SuiteQL SELECT query. Use it for duplicate checks, related-record lookups, cost or quantity lookups, and post-write verification. Non-SELECT input is rejected before any NetSuite request.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(1000).default(50),
        offset: z.number().int().min(0).default(0),
        tokenRole: z.enum(["read", "write"]).default("read"),
      },
    },
    async ({ query, limit, offset, tokenRole }) => {
      if (!/^SELECT\b/i.test(query.trim())) {
        return toolResult({
          ok: false,
          status: 0,
          error: "SuiteQL is read-only: query must start with SELECT.",
        });
      }

      return toolResult(
        await netsuiteRequest({
          method: "POST",
          path: "/query/v1/suiteql",
          query: { limit, offset },
          body: { q: query },
          tokenRole,
          extraHeaders: { Prefer: "transient" },
        }),
      );
    },
  );
}
