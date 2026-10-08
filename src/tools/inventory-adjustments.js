import { z } from "zod";

import { netsuiteRequest } from "../netsuite-client.js";

function toolResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: !result.ok,
  };
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
    "netsuite_create_inventory_adjustment",
    {
      description:
        "Create a NetSuite inventory adjustment with one or more item/location quantity and unit-cost lines. Use for generic stock corrections or item/location moves. Defaults to a no-network dry run; pass dryRun=false explicitly only after reviewing the financial transaction payload.",
      inputSchema: {
        subsidiaryId: z.string().min(1),
        accountId: z.string().min(1),
        reasonId: z.string().min(1).optional(),
        memo: z.string().min(1),
        lines: z
          .array(
            z.object({
              itemId: z.string().min(1),
              locationId: z.string().min(1),
              adjustQtyBy: z.number().finite(),
              unitCost: z.number().finite().nonnegative(),
            }),
          )
          .min(1),
        dryRun: z.boolean().default(true),
        tokenRole: z.enum(["read", "write"]).default("write"),
      },
    },
    async ({ subsidiaryId, accountId, reasonId, memo, lines, dryRun, tokenRole }) => {
      const path = "/record/v1/inventoryAdjustment";
      const body = {
        subsidiary: { id: subsidiaryId },
        account: { id: accountId },
        memo,
        ...(reasonId ? { adjReason: { id: reasonId } } : {}),
        inventory: {
          items: lines.map(({ itemId, locationId, adjustQtyBy, unitCost }) => ({
            item: { id: itemId },
            location: { id: locationId },
            adjustQtyBy,
            unitCost,
          })),
        },
      };

      if (dryRun) {
        return toolResult({ ok: true, dryRun: true, wouldPost: { method: "POST", path, body } });
      }

      const response = await netsuiteRequest({ method: "POST", path, body, tokenRole });
      return toolResult({ ...response, newId: response.ok ? newRecordId(response.location) : null });
    },
  );
}
