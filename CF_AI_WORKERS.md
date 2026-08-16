# Cloudflare AI Workers Integration — AI Insights

## Status: ✅ LIVE on Production

**Endpoint**: `POST /api/insights`  
**Model**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Llama 3.3 70B, FP8 quantized)  
**Live URL**: https://slgrvtrs.ritz-analytics.workers.dev/api/insights  
**Free Tier**: 10,000 neurons/day (~1,400 insights/day)

---

## Overview

The `/api/insights` route generates natural-language analytical insights about
Selangor voter statistics using **Cloudflare AI Workers** — Cloudflare's built-in
serverless LLM inference platform.

This replaces the previous `z-ai-web-dev-sdk` approach which required a filesystem-based
config file (`.z-ai-config`) that doesn't exist on CF Workers. The CF AI Workers binding
(`env.AI`) is native to the Cloudflare platform and requires no external API keys or config files.

---

## How It Works

```
User clicks "AI Insights" button
        ↓
POST /api/insights { type: "parliament", code: "P.100" }
        ↓
D1 Database Query (env.DB)
   → SELECT voter stats for P.100 PANDAN
        ↓
Build JSON payload with demographics
        ↓
env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
   messages: [system, user],
   max_tokens: 500
})
        ↓
Llama 3.3 70B generates 3-5 insight bullets
        ↓
Parse response → return JSON { bullets: [...] }
```

---

## Architecture

### 1. CF AI Binding (wrangler.jsonc)

```jsonc
{
  "ai": {
    "binding": "AI"
  }
}
```

This creates `env.AI` — a native Cloudflare Workers AI binding that provides
`env.AI.run(model, options)` for LLM inference.

### 2. TypeScript Declaration (cloudflare-env.d.ts)

```typescript
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    AI: Ai;  // Workers AI binding
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

### 4. Dual-Mode Operation

The `generateInsights()` function has two modes:

1. **CF Workers (production)**: Uses `env.AI.run()` binding — no API key needed,
   no network requests, lowest latency.
2. **Local dev (fallback)**: Uses the REST API
   (`https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}`)
   with a bearer token. This allows testing the AI insights locally without
   `wrangler dev`.

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
  ],
  "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
}
```

---

## Available Models

Cloudflare AI Workers provides 63 models. The text generation models suitable
for this use case:

| Model | Parameters | Speed | Quality | Neurons/Request |
|-------|-----------|-------|---------|-----------------|
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` ✅ | 70B | Fast | High | ~7 |
| `@cf/meta/llama-3.2-3b-instruct` | 3B | Very Fast | Medium | ~1 |
| `@cf/meta/llama-3.1-8b-instruct-fp8` | 8B | Fast | Good | ~2 |
| `@cf/openai/gpt-oss-120b` | 120B | Medium | Highest | ~12 |
| `@cf/zai-org/glm-4.7-flash` | — | Fast | High | ~5 |

**Selected**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — best balance of
quality, speed, and neuron cost on the free tier.

---

## Free Tier Limits

- **10,000 neurons/day** (free tier)
- **~7 neurons per insight request** (Llama 3.3 70B, ~500 tokens)
- **~1,428 insights/day** before hitting the limit
- Neurons reset daily at 00:00 UTC
- No credit card required

When the limit is exceeded, the AI API returns a `429 Too Many Requests` error.
The route handles this gracefully and returns an error message.

---

## Configuration

### wrangler.jsonc (AI binding)

```jsonc
"ai": {
  "binding": "AI"
}
```

### Environment Variables (for local dev REST API fallback)

These should be set as environment variables — never commit real tokens:

```bash
export CF_ACCOUNT_ID="your_account_id"
export CF_AI_API_TOKEN="your_api_token"
```

```typescript
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const CF_AI_API_TOKEN = process.env.CF_AI_API_TOKEN || '';
```

For production, the `env.AI` binding is used — no tokens needed.

### Deploy Command

```bash
# Deploy with the AI binding
CLOUDFLARE_API_TOKEN=your_token CLOUDFLARE_ACCOUNT_ID=your_account_id npx wrangler deploy
```

The `wrangler deploy` command automatically creates the AI binding based on `wrangler.jsonc`.

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
  ],
  "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
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

## Migration from z-ai-web-dev-sdk

The previous implementation used `z-ai-web-dev-sdk` which:
1. Reads `.z-ai-config` from the filesystem (not available on CF Workers)
2. Uses a session token that expires
3. Required the `nodejs_compat` flag for `fs/promises` polyfill

The new CF AI Workers approach:
1. Uses `env.AI.run()` — native CF Workers binding, no config files
2. No API tokens needed on production (binding handles auth)
3. No filesystem access required
4. Lower latency (no external network call — AI runs on Cloudflare's edge)
5. Free tier: 10,000 neurons/day (generous for this use case)

---

## Files Changed

| File | Change |
|------|--------|
| `dashboard/src/app/api/insights/route.ts` | Rewrote to use `env.AI.run()` with REST API fallback |
| `dashboard/wrangler.jsonc` | Added `"ai": { "binding": "AI" }` |
| `dashboard/src/cloudflare-env.d.ts` | Added `AI: Ai` to `CloudflareEnv` |

---

## Verification

- ✅ `npx tsc --noEmit` → 0 errors
- ✅ `npx @opennextjs/cloudflare build` → success
- ✅ Production deploy → `env.AI` binding active
- ✅ `POST /api/insights { type: "parliament", code: "P.100" }` → 5 bullets returned
- ✅ `POST /api/insights { type: "state" }` → 5 bullets returned
- ✅ Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
