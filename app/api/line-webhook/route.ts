import { NextRequest, NextResponse } from "next/server";
import { validateSignature, WebhookEvent, WebhookRequestBody } from "@line/bot-sdk";
import { getFaqRows, faqToString } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";
import { replyText } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_REPLY = "ขออภัยค่ะ เรื่องนี้ขอให้แอดมินติดต่อกลับไปนะคะ";

type TextMessageEvent = Extract<WebhookEvent, { type: "message" }> & {
  message: { type: "text"; text: string };
  replyToken: string;
};

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature");
  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 401 });
  }

  const rawBody = await req.text();
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";

  if (!validateSignature(rawBody, channelSecret, signature)) {
    console.warn(`[webhook] ${new Date().toISOString()} invalid signature`);
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

  for (const event of textEvents) {
    const { replyToken } = event;
    const userMessage = event.message.text;
    const ts = new Date().toISOString();

    try {
      let faqString = "";
      try {
        const rows = await getFaqRows();
        faqString = faqToString(rows);
      } catch (sheetErr) {
        console.error(`[webhook] ${ts} message="${userMessage}" sheet error:`, sheetErr);
        try {
          await replyText(replyToken, DEFAULT_REPLY);
        } catch (replyErr) {
          console.error(`[webhook] ${ts} replyMessage failed after sheet error:`, replyErr);
        }
        continue;
      }

      const reply = await askGemini(faqString, userMessage);

      try {
        await replyText(replyToken, reply);
      } catch (replyErr) {
        console.error(`[webhook] ${ts} message="${userMessage}" replyMessage failed:`, replyErr);
      }
    } catch (err) {
      console.error(`[webhook] ${ts} message="${userMessage}" unexpected error:`, err);
      try {
        await replyText(replyToken, DEFAULT_REPLY);
      } catch (replyErr) {
        console.error(`[webhook] ${ts} replyMessage failed after unexpected error:`, replyErr);
      }
    }
  }

  // ต้อง return 200 เสมอ ไม่งั้น LINE จะ retry ซ้ำ
  return NextResponse.json({ ok: true });
}
