# Quick Start Prerequisites Analysis

## Overview

This document analyzes the prerequisites documented in the Quick Start section of `README.md` against the actual codebase, identifying gaps and inaccuracies.

## Prerequisites (as documented in README)

1. Node.js 18+
2. An Elasticsearch / Kibana deployment (Elastic Cloud or self-hosted)
3. An API key with read-only privileges on the indices you want to expose

## Detailed Analysis

### 1. Node.js 18+ — Verified

The README states **Node.js 18+** is required. This is confirmed by:

- **`tsconfig.json`** — `"target": "ES2020"` requires a runtime supporting ES2020 features.
- **`.github/workflows/deploy.yml`** — CI runs on **Node.js 20**, which is the recommended version.
- **`package.json`** — Dependencies like `@mastra/core ^1.2.0` and `@mastra/mcp ^1.0.0` target Node 18+.

**Gap:** `package.json` has no `"engines"` field. A user on Node 16 would get a confusing runtime failure rather than a clear error at install time.

**Recommendation:** Add `"engines": { "node": ">=18" }` to `package.json`.

### 2. npm (Implicit prerequisite)

npm is the package manager used throughout (`npm install`, `npm run build:mcp`, `npm test`). This ships with Node.js. No `yarn.lock` or `pnpm-lock.yaml` exists — npm is the only supported package manager. `package-lock.json` is present and committed.

**Gap:** Not explicitly listed as a prerequisite (acceptable since it ships with Node.js).

### 3. Elasticsearch / Kibana Deployment — Partially Verified

The README says you need "An Elasticsearch / Kibana deployment (Elastic Cloud or self-hosted)." This is accurate but incomplete:

- **`src/lib/config.ts:52-53`** — `KIBANA_URL` is required and the Elasticsearch URL is derived by replacing `.kb.` with `.es.` in the hostname.
- The `.kb.` → `.es.` URL derivation is an **Elastic Cloud convention**. Self-hosted deployments typically do not follow this naming pattern, meaning a self-hosted user would get a broken `elasticsearchUrl`.

**Gap:** The README says "Elastic Cloud or self-hosted" but the automatic URL derivation only works for Elastic Cloud. Self-hosted users would need a separate `ELASTICSEARCH_URL` env var (which does not exist). This is noted at `README.md:98` but easy to miss.

**Recommendation:** Either add an `ELASTICSEARCH_URL` env var override, or change the prerequisite to state "Elastic Cloud" as the primary supported target.

### 4. API Key with Read-Only Privileges — Verified

- **`src/lib/config.ts:61`** — `KIBANA_API_KEY` is required (throws if missing).
- The key must be **Base64-encoded**, as stated in the README.
- Read-only is enforced at the application layer (`src/lib/inputSanitizer.ts` blocks `_update`, `_delete`, `_bulk`, `script`), but the API key itself should also be scoped to read-only as defense-in-depth.

### 5. Build Toolchain (Undocumented)

Running `npm run build:mcp` requires:

- **`tsup ^8.5.1`** — Listed as a production dependency (should be devDependency).
- **`typescript ^5.9.3`** — Also listed as a production dependency (should be devDependency).
- The build script uses `cat`, `mv`, `chmod` — these are **Unix commands**. Windows users cannot run the build script as-is without WSL or Git Bash.

**Gap:** No mention of OS compatibility in the prerequisites. The build script is Unix-only.

**Recommendation:** Document that a Unix-like environment is required for building, or provide a cross-platform build script.

### 6. Environment Variables — Verified

| Variable              | Required | Default          | Source           |
|-----------------------|----------|------------------|------------------|
| `KIBANA_URL`          | Yes      | —                | `config.ts:52`   |
| `KIBANA_API_KEY`      | Yes      | —                | `config.ts:61`   |
| `ALLOWED_INDEX_PATTERNS` | No    | `[]` (all)       | `config.ts:62`   |
| `MAX_SEARCH_SIZE`     | No       | `100` (1-500)    | `config.ts:55`   |
| `REQUEST_TIMEOUT_MS`  | No       | `30000`          | `config.ts:66`   |
| `RETRY_ATTEMPTS`      | No       | `3`              | `config.ts:67`   |
| `RETRY_DELAY_MS`      | No       | `1000`           | `config.ts:68`   |
| `KIBANA_SPACE`        | No       | `""` (default)   | `config.ts:69`   |
| `AUDIT_ENABLED`       | No       | `true`           | `config.ts:70`   |
| `PII_REDACTION_ENABLED` | No     | `true`           | `config.ts:71`   |

The README accurately documents all 10 variables. The code matches the documentation.

### 7. `.env` File Support — Documented but Unimplemented

`README.md:80` says *"Create a `.env` file or export environment variables"*, but the codebase has **no `dotenv` dependency** and `config.ts` only reads from `process.env`. A `.env` file will be silently ignored unless the user manually sources it via `source .env`.

**Gap:** Misleading documentation.

**Recommendation:** Either add `dotenv` as a dependency and load it in the entry point, or remove the `.env` file mention from the README.

## Summary of Gaps

| #  | Gap                                                          | Severity | Recommendation                                                        |
|----|--------------------------------------------------------------|----------|-----------------------------------------------------------------------|
| 1  | No `engines` field in `package.json`                         | Low      | Add `"engines": { "node": ">=18" }`                                  |
| 2  | Self-hosted ES/Kibana URL derivation breaks                  | Medium   | Add `ELASTICSEARCH_URL` env var or document limitation prominently    |
| 3  | `tsup` and `typescript` are production deps instead of devDeps | Low    | Move to `devDependencies`                                             |
| 4  | Build script is Unix-only (uses `cat`, `mv`, `chmod`)        | Medium   | Document OS requirement or provide cross-platform alternative         |
| 5  | `.env` file support mentioned but not implemented             | Medium   | Add `dotenv` dependency or remove `.env` claim from README            |
| 6  | No `.env.example` file                                        | Low      | Add template file for easier onboarding                               |

## Test Verification

All 70 tests pass across 7 test files:

- `src/lib/__tests__/auditLogger.test.ts` — 3 tests
- `src/lib/__tests__/mappingUtils.test.ts` — 8 tests
- `src/lib/__tests__/inputSanitizer.test.ts` — 11 tests
- `src/lib/__tests__/piiRedaction.test.ts` — 11 tests
- `src/prompts/__tests__/prompts.test.ts` — 15 tests
- `src/tools/__tests__/discoverCluster.test.ts` — 7 tests
- `src/resources/__tests__/resources.test.ts` — 15 tests

Build (`npm run build:mcp`) completes successfully producing `dist/stdio.mjs` (170 KB) and `dist/stdio.js` (171 KB).
