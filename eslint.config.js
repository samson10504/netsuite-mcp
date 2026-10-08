import js from "@eslint/js";

const nodeGlobals = {
  AbortController: "readonly",
  Buffer: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  DOMException: "readonly",
  fetch: "readonly",
  Headers: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js", "scripts/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
];
