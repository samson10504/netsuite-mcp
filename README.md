# netsuite-mcp

`netsuite-mcp` is a general-purpose, extensible Model Context Protocol server for NetSuite. Its current tools cover read-only SuiteQL, generic record reads/creates/updates (including product and item creation), and inventory adjustments. Future NetSuite operations can be added as independent tool groups.

This package exposes NetSuite REST and SuiteQL primitives. It intentionally contains no workflow-specific business logic, naming conventions, field defaults, or account-specific rules; those belong in the skill or agent that calls these tools.

## Quick start

Requires Node.js 18 or newer and a NetSuite Token-Based Authentication integration.

```bash
npx --yes --package netsuite-mcp@0.1.1 netsuite-mcp
```

Provide credentials through exported environment variables, an MCP client's `env` block, or a local `.env`. The local `.env` loader runs only when `NETSUITE_ACCOUNT_ID` is not already set.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NETSUITE_ACCOUNT_ID` | Yes | NetSuite account ID, such as `9694868` or sandbox `1234567-sb1`. |
| `NETSUITE_CONSUMER_KEY` | Yes | Integration record consumer key. |
| `NETSUITE_CONSUMER_SECRET` | Yes | Integration record consumer secret. |
| `NETSUITE_TBA_TOKEN_ID_READ` | Optional* | Token ID for the read role, used by default for SuiteQL. |
| `NETSUITE_TBA_TOKEN_SECRET_READ` | Optional* | Secret matching the read token ID. |
| `NETSUITE_TBA_TOKEN_ID_WRITE` | Optional* | Token ID for the write role, used by default for record operations. |
| `NETSUITE_TBA_TOKEN_SECRET_WRITE` | Optional* | Secret matching the write token ID. |
| `NETSUITE_REQUEST_TIMEOUT_MS` | Optional | Per-request timeout in milliseconds. Defaults to `30000`. Raise it on accounts where NetSuite responds slowly. |

\* Configure at least one complete read or write token pair. A tool call that selects an unconfigured role fails with the missing variable names.

### Claude Code and Claude Desktop

Add this to `claude_desktop_config.json` or Claude Code's MCP settings:

```json
{
  "mcpServers": {
    "netsuite": {
      "command": "npx",
      "args": ["--yes", "--package", "netsuite-mcp@0.1.1", "netsuite-mcp"],
      "env": {
        "NETSUITE_ACCOUNT_ID": "9694868",
        "NETSUITE_CONSUMER_KEY": "...",
        "NETSUITE_CONSUMER_SECRET": "...",
        "NETSUITE_TBA_TOKEN_ID_READ": "...",
        "NETSUITE_TBA_TOKEN_SECRET_READ": "...",
        "NETSUITE_TBA_TOKEN_ID_WRITE": "...",
        "NETSUITE_TBA_TOKEN_SECRET_WRITE": "..."
      }
    }
  }
}
```

### LibreChat

LibreChat's current stdio MCP configuration uses the same `command`, `args`, and `env` fields under the top-level `mcpServers` key:

```yaml
mcpServers:
  netsuite:
    type: stdio
    command: npx
    args:
      - "--yes"
      - "--package"
      - "netsuite-mcp@0.1.1"
      - "netsuite-mcp"
    initTimeout: 120000
    env:
      NETSUITE_ACCOUNT_ID: "9694868"
      NETSUITE_CONSUMER_KEY: "..."
      NETSUITE_CONSUMER_SECRET: "..."
      NETSUITE_TBA_TOKEN_ID_READ: "..."
      NETSUITE_TBA_TOKEN_SECRET_READ: "..."
      NETSUITE_TBA_TOKEN_ID_WRITE: "..."
      NETSUITE_TBA_TOKEN_SECRET_WRITE: "..."
```

Keep each `args` value as a separate YAML item. The explicit `--package netsuite-mcp@0.1.1 netsuite-mcp` form makes `npx` run this package's binary even when the host already has another global binary named `netsuite-mcp`. The longer initialization timeout allows for a cold npm cache. `NETSUITE_ROLE_ID` and `NETSUITE_SERVICE_HOST` belong to other NetSuite integrations and are not used by this server.

Credentials written literally in the server-level `env` block are administrator-provided credentials and may be shared by everyone allowed to use that server. LibreChat supports user-scoped MCP connections and `customUserVars` placeholders for per-user credentials. Confirm the scoping appropriate to your deployment in [LibreChat's current MCP server documentation](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers); do not assume a static credential block is isolated per user.

## Tools

| Tool group | Tool | Description |
| --- | --- | --- |
| `src/tools/system.js` | `netsuite_probe` | Validate a read or write token against the REST metadata catalog for one record type (defaults to `customer`; the full catalog is deliberately not requested because it can exceed the request timeout on large accounts). |
| `src/tools/query.js` | `netsuite_suiteql` | Run a guarded, read-only SuiteQL `SELECT` with pagination. |
| `src/tools/records.js` | `netsuite_get_record` | Read any record and optional sub-resource by type and internal ID. |
| `src/tools/records.js` | `netsuite_create_record` | Dry-run or create any record from a generic JSON body. |
| `src/tools/records.js` | `netsuite_update_record` | Dry-run or partially update any record from a generic JSON body. |
| `src/tools/inventory-adjustments.js` | `netsuite_create_inventory_adjustment` | Dry-run or create a multi-line inventory adjustment. |

## Security model

Every write tool defaults to `dryRun: true` and performs no network request until the caller explicitly supplies `dryRun: false`. Review the returned `wouldPost` or `wouldPatch` payload before approving a live write. SuiteQL rejects input whose trimmed text does not begin with `SELECT` before making a network request.

Separate read and write token roles support least-privilege NetSuite roles. Tools expose `tokenRole` when an operator needs to override the default. HTTP errors are returned with their full status and body so callers can act on NetSuite errors; secrets and authorization headers are never included in tool results.

## NetSuite prerequisites

1. Enable SuiteTalk REST Web Services and Token-Based Authentication in NetSuite.
2. Create an Integration record with Token-Based Authentication enabled and retain its consumer key and secret.
3. Create least-privilege read and write roles. Grant only the record, transaction, REST Web Services, and SuiteAnalytics Workbook permissions required by your workflows.
4. Generate access tokens for the integration and roles, then set the environment variables above.

See Oracle's [Token-based Authentication setup documentation](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4247337262.html) and [SuiteTalk REST Web Services permissions documentation](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1544782801.html) for current account setup details.

## Roadmap and extending

New capabilities belong in a new logical module under `src/tools/`, such as `src/tools/purchase-orders.js`. Export a `register(server)` function, import it in `src/index.js`, and call it during startup. Keep account-specific orchestration in calling skills and reuse `src/netsuite-client.js` unchanged for signed HTTP transport.

Before publishing, run:

```bash
npm run prepublishOnly
npm pack --dry-run
```

## License

MIT
