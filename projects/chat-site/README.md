# OpenAI LiteLLM Chat

This subproject is the Vercel-ready scaffold for a TypeScript chat application that will use the OpenAI Agents SDK with a LiteLLM-backed OpenAI-compatible endpoint.

## Stack

- Next.js App Router
- TypeScript
- Node.js 22 via `.nvmrc`
- pnpm
- Vitest

## Getting started

Use Node.js 22, then install dependencies and run the local app:

```bash
nvm use
corepack enable pnpm
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Current status

The current scaffold includes:

- TypeScript-based Next.js app structure
- Node 22 / pnpm project policy
- Runtime environment parsing with Zod
- A placeholder landing page for the upcoming chat UI

The next implementation steps add the Agents SDK integration, direct OpenAI client override for `baseURL` and `apiKey`, the server chat route, retries, and Langfuse instrumentation.

## Environment contract

Copy `.env.example` to `.env.local` and provide:

- `OPENAI_BASE_URL` - the OpenAI-compatible LiteLLM endpoint
- `OPENAI_API_KEY` - the API key used by the overridden OpenAI client
- `DEFAULT_MODEL` - the default model name exposed in the app
- `OPENAI_API_MODE` - `chat_completions` or `responses`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_HOST`

Optional:

- `OPENAI_AGENTS_ENABLE_TRACING`
- `OPENAI_TRACING_API_KEY` when OpenAI tracing is enabled

## Deployment target

This app is intended to deploy on Vercel using the Node.js runtime. LiteLLM is expected to run as a separate service.
