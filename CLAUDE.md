# CLAUDE.md — LINE Bot AI Project

## What we're building

LINE Official Account bot for EA Aura · ตอบลูกค้า 24 ชม. โดยใช้ Gemini Flash
อ่าน FAQ จาก Google Sheet · ส่ง reply กลับ LINE

## Stack — locked

- Next.js 15 App Router + TypeScript
- `@line/bot-sdk` v9 for LINE Messaging API
- `@google/genai` for Gemini
- Google Sheet CSV public URL for FAQ
- Vercel for hosting

## Repo conventions

- `app/api/line-webhook/route.ts` → POST handler (verify signature → process → reply)
- `lib/sheet.ts` → fetch + parse (RFC4180) + cache CSV 60s
- `lib/gemini.ts` → call Gemini with system prompt + guardrails
- `lib/handoff.ts` → Smart Handoff trigger detection + notify admin
- `lib/line.ts` → LINE client wrapper + reply with retry
- `lib/log.ts` → structured JSON logging helper
- `types/index.ts` → shared TypeScript types

## Env vars (Vercel)

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GEMINI_API_KEY`
- `SHEET_CSV_URL`
- `ADMIN_GROUP_ID` (Smart Handoff target · optional)

## Don'ts

- ❌ Hardcode any token/key — use env vars
- ❌ Skip signature verification — security risk
- ❌ Skip timeout on Gemini calls — webhook must reply within 10s
- ❌ Cache FAQ for >60s — owner edits Sheet should reflect quickly
- ❌ Log full LINE message content — PII risk · log only metadata
- ❌ Change temperature or maxOutputTokens without checking token accounting
