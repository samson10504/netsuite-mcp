import assert from "node:assert/strict";
import { test } from "node:test";

import { netsuiteRequest } from "../src/netsuite-client.js";

const baseEnv = {
  NETSUITE_ACCOUNT_ID: "1234567",
  NETSUITE_CONSUMER_KEY: "ck",
  NETSUITE_CONSUMER_SECRET: "cs",
  NETSUITE_TBA_TOKEN_ID_READ: "rid",
  NETSUITE_TBA_TOKEN_SECRET_READ: "rs",
};

const fixedDeps = {
  randomBytesImpl: () => Buffer.alloc(16, 1),
  now: () => 1_700_000_000_000,
};

function fakeResponse({ ok = true, status = 200, statusText = "OK", body = null } = {}) {
  return {
    ok,
    status,
    statusText,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => (body === null ? "" : JSON.stringify(body)),
  };
}

function captureFetch(response = fakeResponse()) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  return { calls, fetchImpl };
}

test("throws when core configuration is missing", async () => {
  await assert.rejects(
    () => netsuiteRequest({ method: "GET", path: "/record/v1/customer/1", tokenRole: "read" }, { env: {} }),
    /Missing NetSuite configuration/,
  );
});

test("throws on invalid account id", async () => {
  await assert.rejects(
    () =>
      netsuiteRequest(
        { method: "GET", path: "/record/v1/customer/1", tokenRole: "read" },
        { env: { ...baseEnv, NETSUITE_ACCOUNT_ID: "bad id!" } },
      ),
    /Invalid NETSUITE_ACCOUNT_ID format/,
  );
});

test("throws when the requested token role pair is missing", async () => {
  await assert.rejects(
    () =>
      netsuiteRequest(
        { method: "GET", path: "/record/v1/customer/1", tokenRole: "write" },
        { env: baseEnv },
      ),
    /Missing NetSuite write token configuration: NETSUITE_TBA_TOKEN_ID_WRITE, NETSUITE_TBA_TOKEN_SECRET_WRITE/,
  );
});

test("signs a GET request and returns the parsed body", async () => {
  const { calls, fetchImpl } = captureFetch(fakeResponse({ body: { id: 1 } }));
  const result = await netsuiteRequest(
    { method: "GET", path: "/record/v1/customer/1", query: { expandSubResources: true }, tokenRole: "read" },
    { env: baseEnv, fetchImpl, ...fixedDeps },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.body, { id: 1 });
  assert.equal(result.error, null);

  const { url, init } = calls[0];
  assert.equal(url.host, "1234567.suitetalk.api.netsuite.com");
  assert.equal(url.pathname, "/services/rest/record/v1/customer/1");
  assert.equal(url.searchParams.get("expandSubResources"), "true");
  assert.equal(init.method, "GET");

  const authorization = init.headers.get("Authorization");
  assert.match(authorization, /^OAuth realm="1234567"/);
  assert.match(authorization, /oauth_consumer_key="ck"/);
  assert.match(authorization, /oauth_token="rid"/);
  assert.match(authorization, /oauth_nonce="(?:01){16}"/);
  assert.match(authorization, /oauth_signature="[^"]+"/);
});

test("passes through extra headers and JSON body on POST", async () => {
  const { calls, fetchImpl } = captureFetch();
  await netsuiteRequest(
    {
      method: "POST",
      path: "/query/v1/suiteql",
      query: { limit: 5, offset: 0 },
      body: { q: "SELECT id FROM currency" },
      tokenRole: "read",
      extraHeaders: { Prefer: "transient" },
    },
    { env: baseEnv, fetchImpl, ...fixedDeps },
  );

  const { url, init } = calls[0];
  assert.equal(url.searchParams.get("limit"), "5");
  assert.equal(init.headers.get("Prefer"), "transient");
  assert.equal(init.headers.get("Content-Type"), "application/json");
  assert.equal(init.body, JSON.stringify({ q: "SELECT id FROM currency" }));
});

test("flattens o:errorDetails into the top-level error field", async () => {
  const { fetchImpl } = captureFetch(
    fakeResponse({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      body: {
        "o:errorDetails": [
          { detail: "first problem", "o:errorCode": "E1" },
          { detail: "second problem" },
        ],
      },
    }),
  );
  const result = await netsuiteRequest(
    { method: "GET", path: "/record/v1/customer/1", tokenRole: "read" },
    { env: baseEnv, fetchImpl, ...fixedDeps },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.error, "E1: first problem | second problem");
});

function abortingFetch() {
  return (_url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted", "AbortError")),
      );
    });
}

test("reports dependency-injected timeout", async () => {
  await assert.rejects(
    () =>
      netsuiteRequest(
        { method: "GET", path: "/record/v1/customer/1", tokenRole: "read" },
        { env: baseEnv, fetchImpl: abortingFetch(), timeoutMs: 5 },
      ),
    /NetSuite request timed out after 5ms/,
  );
});

test("honours NETSUITE_REQUEST_TIMEOUT_MS override", async () => {
  await assert.rejects(
    () =>
      netsuiteRequest(
        { method: "GET", path: "/record/v1/customer/1", tokenRole: "read" },
        { env: { ...baseEnv, NETSUITE_REQUEST_TIMEOUT_MS: "7" }, fetchImpl: abortingFetch() },
      ),
    /NetSuite request timed out after 7ms/,
  );
});
