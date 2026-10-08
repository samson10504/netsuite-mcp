import { createHmac, randomBytes } from "node:crypto";

const REQUEST_TIMEOUT_MS = 30_000;

function resolveTimeoutMs(env, dependencies) {
  if (dependencies.timeoutMs !== undefined) return dependencies.timeoutMs;
  const fromEnv = Number.parseInt(env.NETSUITE_REQUEST_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return REQUEST_TIMEOUT_MS;
}

function errorSummary(responseBody) {
  const details = responseBody?.["o:errorDetails"];
  if (!Array.isArray(details) || details.length === 0) return null;
  return details
    .map((detail) => [detail?.["o:errorCode"], detail?.detail].filter(Boolean).join(": "))
    .filter(Boolean)
    .join(" | ") || null;
}

function percentEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!*'()]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function queryEntries(query = {}) {
  return Object.entries(query).flatMap(([key, value]) => {
    if (value === undefined || value === null) return [];
    return (Array.isArray(value) ? value : [value]).map((item) => [key, String(item)]);
  });
}

function tokenCredentials(env, tokenRole) {
  const suffix = tokenRole.toUpperCase();
  const tokenId = env[`NETSUITE_TBA_TOKEN_ID_${suffix}`];
  const tokenSecret = env[`NETSUITE_TBA_TOKEN_SECRET_${suffix}`];

  if (!tokenId || !tokenSecret) {
    const missing = [
      !tokenId && `NETSUITE_TBA_TOKEN_ID_${suffix}`,
      !tokenSecret && `NETSUITE_TBA_TOKEN_SECRET_${suffix}`,
    ].filter(Boolean);
    throw new Error(`Missing NetSuite ${tokenRole} token configuration: ${missing.join(", ")}`);
  }

  return { tokenId, tokenSecret };
}

/**
 * Make a signed request to NetSuite's REST API.
 * NetSuite HTTP errors are returned as data; only configuration and transport failures throw.
 */
export async function netsuiteRequest(
  { method, path, query, body, tokenRole, extraHeaders },
  dependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const randomBytesImpl = dependencies.randomBytesImpl ?? randomBytes;
  const now = dependencies.now ?? Date.now;
  const accountId = env.NETSUITE_ACCOUNT_ID;
  const consumerKey = env.NETSUITE_CONSUMER_KEY;
  const consumerSecret = env.NETSUITE_CONSUMER_SECRET;

  const missing = [
    !accountId && "NETSUITE_ACCOUNT_ID",
    !consumerKey && "NETSUITE_CONSUMER_KEY",
    !consumerSecret && "NETSUITE_CONSUMER_SECRET",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Missing NetSuite configuration: ${missing.join(", ")}`);
  }
  if (!/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(accountId)) {
    throw new Error("Invalid NETSUITE_ACCOUNT_ID format");
  }

  if (tokenRole !== "read" && tokenRole !== "write") {
    throw new Error('tokenRole must be either "read" or "write"');
  }

  const { tokenId, tokenSecret } = tokenCredentials(env, tokenRole);
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const hostAccount = accountId.toLowerCase().replaceAll("_", "-");
  const baseUrl = `https://${hostAccount}.suitetalk.api.netsuite.com/services/rest${normalizedPath}`;
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytesImpl(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: String(Math.floor(now() / 1000)),
    oauth_token: tokenId,
    oauth_version: "1.0",
  };

  const signatureParameters = [...queryEntries(query), ...Object.entries(oauth)]
    .map(([key, value]) => [percentEncode(key), percentEncode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const left = leftKey === rightKey ? leftValue : leftKey;
      const right = leftKey === rightKey ? rightValue : rightKey;
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signatureBase = [
    normalizedMethod,
    percentEncode(baseUrl),
    percentEncode(signatureParameters),
  ].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = createHmac("sha256", signingKey).update(signatureBase).digest("base64");
  const realm = accountId.toUpperCase().replaceAll("-", "_");
  const authorizationParameters = [
    ["realm", realm],
    ["oauth_consumer_key", oauth.oauth_consumer_key],
    ["oauth_token", oauth.oauth_token],
    ["oauth_signature_method", oauth.oauth_signature_method],
    ["oauth_timestamp", oauth.oauth_timestamp],
    ["oauth_nonce", oauth.oauth_nonce],
    ["oauth_version", oauth.oauth_version],
    ["oauth_signature", signature],
  ];
  const authorization = `OAuth ${authorizationParameters
    .map(([key, value]) => `${key}="${percentEncode(value)}"`)
    .join(", ")}`;

  const url = new URL(baseUrl);
  for (const [key, value] of queryEntries(query)) url.searchParams.append(key, value);
  const headers = new Headers(extraHeaders);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  headers.set("Authorization", authorization);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeoutMs = resolveTimeoutMs(env, dependencies);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let text;
  try {
    response = await fetchImpl(url, {
      method: normalizedMethod,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`NetSuite request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`NetSuite transport failure: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  let responseBody = null;
  if (text) {
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    error: response.ok ? null : errorSummary(responseBody),
    headers: Object.fromEntries(response.headers.entries()),
    location: response.headers.get("location"),
    body: responseBody,
  };
}
