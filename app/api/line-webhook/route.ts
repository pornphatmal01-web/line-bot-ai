import { NextRequest, NextResponse } from "next/server";
import { validateSignature, WebhookEvent, WebhookRequestBody } from "@line/bot-sdk";
import { getFaqRows, faqToString } from "@/lib/sheet";
import { askGemini, DEFAULT_REPLY } from "@/lib/gemini";
import { replyText } from "@/lib/line";
import { shouldHandoff, notifyAdmin } from "@/lib/handoff";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type TextMessageEvent = Extract<WebhookEvent, { type: "message" }> & {
  message: { type: "text"; text: string };
  replyToken: string;
  source: { userId?: string };
};

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature");
  if (!signature) {
    log.warn("webhook.no_signature");
    return NextResponse.json({ error: "No signature" }, { status: 401 });
  }

  const rawBody = await req.text();
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";

  if (!validateSignature(rawBody, channelSecret, signature)) {
    log.warn("webhook.invalid_signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body: WebhookRequestBody = JSON.parse(rawBody);
  const events = body.events ?? [];

  const textEvents = events.filter(
    (e): e is TextMessageEvent =>
      e.type === "message" &&
      "message" in e &&
      (e as TextMessageEvent).message.type === "text" &&
      "replyToken" in e
  );

  // ประมวลผลแบบ parallel (LINE บางครั้ง batch หลาย events)
  await Promise.all(
    textEvents.map(async (event) => {
      const { replyToken } = event;
      const userMessage = event.message.text;
      const userId = event.source?.userId ?? "unknown";
      const startTime = Date.now();

      try {
        // 1. ตรวจ Smart Handoff ก่อนเรียก Gemini
        if (shouldHandoff(userMessage)) {
          await notifyAdmin(userId, userMessage);
          await replyText(replyToken, "ขอโทษนะคะ รอสักครู่ แอดมินจะติดต่อกลับไปเร็วๆ นี้ค่ะ");
          log.info("handoff.routed", { userId, latencyMs: Date.now() - startTime });
          return;
        }

        // 2. ดึง FAQ (cached 60s)
        let faqString = "";
        try {
          const rows = await getFaqRows();
          faqString = faqToString(rows);
        } catch (sheetErr) {
          log.error("sheet.failed", { err: (sheetErr as Error).message, userId });
          await replyText(replyToken, DEFAULT_REPLY).catch(() => {});
          return;
        }

        // 3. เรียก Gemini (timeout 8s ใน askGemini)
        const reply = await askGemini(faqString, userMessage);

        // 4. ส่ง reply กลับ LINE
        try {
          await replyText(replyToken, reply);
        } catch (replyErr) {
          // replyToken หมดอายุหรือ error — log แล้วปล่อยผ่าน ห้าม crash
          log.error("reply.failed", {
            err: (replyErr as Error).message,
            userId,
            latencyMs: Date.now() - startTime,
          });
          return;
        }

        log.info("reply.sent", {
          userId,
          latencyMs: Date.now() - startTime,
          replyLength: reply.length,
        });
      } catch (err) {
        log.error("webhook.error", { err: (err as Error).message, userId });
        try {
          await replyText(replyToken, DEFAULT_REPLY);
        } catch {
          // replyToken หมดอายุแล้ว — swallow
        }
      }
    })
  );

  // ต้อง return 200 เสมอ ไม่งั้น LINE จะ retry ซ้ำ
  return NextResponse.json({ ok: true });
}
