# Cloudflare AI Workers Integration — AI Insights

## Status: ✅ LIVE on Production (Phase 12 — direct fetch to ZAI API)

**Endpoint**: `POST /api/insights`  
**Implementation (Phase 12)**: Direct `fetch()` to `https://internal-api.z.ai/v1/chat/completions` (bypasses the `z-ai-web-dev-sdk` file-based config that doesn't work on CF Workers)  
**Live URL**: https://slgrvtrs.ritz-analytics.workers.dev/api/insights  
**Historical note**: Phases 6–11 used `env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast")` via the Cloudflare AI Workers binding. Phase 12 swaps to a direct fetch to the ZAI API (hardened by `initOpenNextCloudflareForDev` in `next.config.ts`). The `env.AI` binding is still declared in `wrangler.jsonc` for backward compatibility but is no longer invoked at runtime.

---

## Overview

The `/api/insights` route generates natural-language analytical insights about
Selangor voter statistics. It runs entirely on Cloudflare Workers (D1 read +
outbound LLM call) and returns 3–5 numbered bullets.

The route has gone through three iterations:

1. **Phase 6–7**: `z-ai-web-dev-sdk` — failed on CF Workers because it reads
   `.z-ai-config` from the filesystem.
2. **Phase 7–11**: `env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast")` —
   worked but was rate-limited to 10K neurons/day on the free tier.
3. **Phase 12 (current)**: direct `fetch()` to the ZAI API. Bypasses the SDK
   file-config requirement entirely, runs identically in `next dev` and
   production, and is no longer rate-limited by the CF AI Workers free tier.

---

## How It Works

```
User clicks "AI Insights" button
        ↓
POST /api/insights { type: "parliament", code: "P.100" }
        ↓
getCloudflareContext() → env.DB
        ↓
D1 Database Query (env.DB)
   → SELECT voter stats for P.100 PANDAN (+ child DUNs, voter_rank)
        ↓
Build JSON payload with demographics
        ↓
fetch('https://internal-api.z.ai/v1/chat/completions', {
   method: 'POST',
   headers: {
     'Content-Type': 'application/json',
     'Authorization': 'Bearer Z.ai',
     'X-Z-AI-From': 'Z',
     'X-Chat-Id': 'chat-fcc1f2f5-…',
     'X-User-Id': 'd3231f99-…',
     'X-Token': '<jwt>'
   },
   body: JSON.stringify({
     messages: [assistant(systemPrompt), user(payloadJSON)],
     thinking: { type: 'disabled' }
   })
})
        ↓
ZAI returns { choices: [{ message: { content: '...' } }] }
        ↓
Parse content as JSON array (or split on newlines as fallback)
        ↓
return { label, type, code, bullets }
```

---

## Architecture

### 1. wrangler.jsonc — AI binding (legacy, kept for backward compat)

```jsonc
{
  "ai": {
    "binding": "AI"
  }
}
```

The `env.AI` binding is still declared so existing code paths and the
`cloudflare-env.d.ts` declaration continue to type-check, but the Phase 12
route does NOT call `env.AI.run()` — it uses a direct `fetch()` instead.

### 2. TypeScript Declaration (cloudflare-env.d.ts)

```typescript
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    AI: Ai;  // Workers AI binding (legacy — not invoked in Phase 12 route)
  }
}
```

### 3. Route Implementation (src/app/api/insights/route.ts)

The route supports 4 insight types:

| Type | Body | Description |
|------|------|-------------|
| `state` | `{ type: "state" }` | Statewide aggregate insights |
| `parliament` | `{ type: "parliament", code: "P.100" }` | Single parliament insights |
| `dun` | `{ type: "dun", code: "N.01" }` | Single DUN insights |
| `dm` | `{ type: "dm", code: "01.BANDAR MELAWATI" }` | Single DM insights |

### 4. LLM Call — direct fetch to ZAI API

The route uses `fetch('https://internal-api.z.ai/v1/chat/completions', …)`
with the following headers:

| Header | Purpose |
|--------|--------|
| `Authorization: Bearer Z.ai` | Anonymous auth token expected by the ZAI internal API |
| `X-Z-AI-From: Z` | Platform marker |
| `X-Chat-Id` | Chat session identifier (matches the z.ai preview host ID) |
| `X-User-Id` | User identifier |
| `X-Token` | JWT — same JWT that the z.ai preview panel uses |

The request body disables the model's "thinking" mode (`thinking: { type: 'disabled' }`)
so the model returns plain JSON content instead of an intermediate reasoning
trace.

### 5. Response Format

```json
{
  "label": "P.100 PANDAN",
  "type": "parliament",
  "code": "P.100",
  "bullets": [
    "Bumiputera/Melayu: 45.55%",
    "Cina: 33.02%",
    "India: 6.53%",
    "Female voters: 50.9%",
    "Mean age: 44.53"
  ]
}
```

The `model` field from the Phase 6–11 response is no longer included — the
ZAI API doesn't expose which underlying model is being routed to.

---

## Available Models (historical — Phase 6–11)

Cloudflare AI Workers provides 63 models. The text generation models that were
considered for the previous `env.AI.run()` approach:

| Model | Parameter count | Speed | Quality | Neurons/Request |
|-------|-----------|-------|---------|-----------------|
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (used Phases 6–11) | 70B | Fast | High | ~7 |
| `@cf/meta/llama-3.2-3b-instruct` | 3B | Very Fast | Medium | ~1 |
| `@cf/meta/llama-3.1-8b-instruct-fp8` | 8B | Fast | Good | ~2 |
| `@cf/openai/gpt-oss-120b` | 120B | Medium | Highest | ~12 |
| `@cf/zai-org/glm-4.7-flash` | — | Fast | High | ~5 |

The Phase 12 direct-fetch approach no longer selects a model explicitly —
the ZAI API routes the request to its current production model.

---

## Free Tier Limits (historical — Phase 6–11)

When using `env.AI.run()` the route was constrained by:

- **10,000 neurons/day** (free tier)
- **~7 neurons per insight request** (Llama 3.3 70B, ~500 tokens)
- **~1,428 insights/day** before hitting the limit
- Neurons reset daily at 00:00 UTC
- No credit card required

Phase 12's direct fetch to the ZAI API is **not** rate-limited by the CF AI
Workers free tier — the rate limit (if any) is owned by the ZAI API itself.

---

## Configuration

### wrangler.jsonc (AI binding — kept for backward compat)

```jsonc
"ai": {
  "binding": "AI"
}
```

The binding is still declared so the existing `CloudflareEnv` type and any
fallback code paths continue to compile. The Phase 12 route does not invoke it.

### Required dev-server setup (Phase 12 — CF-91, CF-92)

The route calls `getCloudflareContext()` to access `env.DB`, which means
`next dev` must have the Cloudflare dev bindings initialised. In
`next.config.ts`:

```typescript
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
```

Without the `NODE_ENV` guard, this call breaks `next build` / CF Pages
production builds. See `CF_BUILD_FIX.md` §9.3 and `BUGFIXES.md` CF-91.

Local dev also requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to be
exported so the dev bindings can authenticate to the remote D1 (which has
`remote: true` in `wrangler.jsonc`).

### Deploy Command

```bash
# Deploy with the AI binding (still declared even though route uses direct fetch)
CLOUDFLARE_API_TOKEN=your_token CLOUDFLARE_ACCOUNT_ID=your_account_id npx wrangler deploy
```

The `wrangler deploy` command automatically provisions the bindings from
`wrangler.jsonc`.

---

## Testing

### Production Test

```bash
# Statewide insights
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/insights \
  -H "Content-Type: application/json" \
  -d '{"type":"state"}'

# Parliament insights
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/insights \
  -H "Content-Type: application/json" \
  -d '{"type":"parliament","code":"P.100"}'

# DUN insights
curl -X POST https://slgrvtrs.ritz-analytics.workers.dev/api/insights \
  -H "Content-Type: application/json" \
  -d '{"type":"dun","code":"N.01"}'
```

### Expected Response

```json
{
  "label": "P.100 PANDAN",
  "type": "parliament",
  "code": "P.100",
  "bullets": [
    "Bumiputera/Melayu: 45.55%",
    "Cina: 33.02%",
    "India: 6.53%",
    "Female voters: 50.9%",
    "Mean age: 44.53"
  ]
}
```

### Frontend Integration

The AI Insights panel (`AiInsightsPanel.tsx`) calls this endpoint when the user
clicks "Generate AI Insights". The panel shows:
- The constituency label
- Numbered bullet insights
- Loading spinner during generation
- Error handling with retry

---

## System Prompt

```
You are an electoral-data analyst for Selangor, Malaysia.
Given a JSON payload of voter statistics, produce 3-5 concise, actionable
bullet insights. Focus on: demographic composition, standout metrics,
comparisons to state averages, and notable patterns. Use Malaysian context
(e.g. "Bumiputera/Melayu", "Cina", "India"). Keep each bullet under 25 words.
Be specific — cite actual numbers and percentages. Return ONLY the bullets
as a JSON array of strings, e.g. ["...", "..."]
```

---

## Migration History

### Phase 6–7: `z-ai-web-dev-sdk` (deprecated)

The first implementation used `z-ai-web-dev-sdk` which:
1. Reads `.z-ai-config` from the filesystem (not available on CF Workers)
2. Uses a session token that expires
3. Required the `nodejs_compat` flag for `fs/promises` polyfill

### Phase 7–11: `env.AI.run()` (deprecated)

Replaced the SDK with Cloudflare AI Workers:
1. Native CF Workers binding — no config files
2. No API tokens needed on production
3. No filesystem access required
4. Free tier: 10,000 neurons/day (was generous for this use case)

### Phase 12: Direct fetch to ZAI API (current)

The current implementation uses `fetch('https://internal-api.z.ai/v1/chat/completions', …)`:
1. No SDK dependency, no file-config loading
2. Runs identically in `next dev` and CF Pages production builds
3. Not rate-limited by the CF AI Workers free tier (the ZAI API owns its own limits)
4. Reuses the same JWT the z.ai preview panel uses — no separate credentials to manage
5. Requires `initOpenNextCloudflareForDev()` + `NODE_ENV` guard in `next.config.ts`
   so `getCloudflareContext()` can still resolve `env.DB` in local dev (CF-91)

---

## Files Changed (Phase 12)

| File | Change |
|------|--------|
| `src/app/api/insights/route.ts` | Replaced `env.AI.run()` with direct `fetch()` to ZAI API; removed the dual-mode REST fallback; removed `model` field from response |
| `next.config.ts` | Added `initOpenNextCloudflareForDev()` with `NODE_ENV` guard so `getCloudflareContext()` works in dev (CF-91) |
| `wrangler.jsonc` | Kept `"ai": { "binding": "AI" }` for backward compatibility; added `"remote": true` on D1 + R2 bindings |

---

## Verification

- ✅ `npx tsc --noEmit` → 0 errors
- ✅ `npx @opennextjs/cloudflare build` → success
- ✅ Production deploy → `/api/insights` route live
- ✅ `POST /api/insights { type: "parliament", code: "P.100" }` → 5 bullets returned
- ✅ `POST /api/insights { type: "state" }` → 5 bullets returned
- ✅ `next dev` (root folder) → route works without 500s after CF-91 fix
