import { GoogleGenAI } from "@google/genai";
import { log } from "@/lib/log";

// ตรวจสอบชื่อ model ใน aistudio.google.com ก่อนเปลี่ยน
const MODEL = "gemini-2.0-flash";
const TIMEOUT_MS = 8_000;

export const DEFAULT_REPLY = "ขออภัยค่ะ เรื่องนี้ขอให้แอดมินติดต่อกลับไปนะคะ";

function buildPrompt(faqText: string, userMessage: string): string {
  return `คุณคือพนักงานตอบคำถามลูกค้าของ "EA Aura" (โปรแกรมเทรด Forex อัตโนมัติ)

กฎสำคัญ:
1. ตอบเฉพาะข้อมูลที่อยู่ใน FAQ ด้านล่างเท่านั้น
2. ถ้าคำถามตรงหรือใกล้เคียงกับ FAQ → ตอบจาก FAQ ทันที รวมลิงก์และข้อมูลสำคัญด้วย
3. ถ้าไม่พบข้อมูลใน FAQ เลย → ตอบว่า "${DEFAULT_REPLY}"
4. ภาษาไทยสุภาพ ลงท้ายด้วย "ค่ะ" ตอบสั้นกระชับ

FAQ:
${faqText}

คำถามลูกค้า: ${userMessage}
คำตอบ:`;
}

export async function askGemini(
  faqCsvString: string,
  userMessage: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const startTime = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("gemini_timeout")), TIMEOUT_MS)
  );

  try {
    const result = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: buildPrompt(faqCsvString, userMessage),
        config: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
      timeoutPromise,
    ]);

    const candidate = result.candidates?.[0];
    const finishReason = candidate?.finishReason ?? "UNKNOWN";
    const usage = result.usageMetadata;

    log.info("gemini.reply", {
      latencyMs: Date.now() - startTime,
      finishReason,
      thoughtsTokenCount: usage?.thoughtsTokenCount ?? 0,
      candidatesTokenCount: usage?.candidatesTokenCount ?? 0,
      totalTokenCount: usage?.totalTokenCount ?? 0,
    });

    if (finishReason === "MAX_TOKENS") {
      log.warn("gemini.truncated", {
        thoughtsTokenCount: usage?.thoughtsTokenCount,
        candidatesTokenCount: usage?.candidatesTokenCount,
      });
      return DEFAULT_REPLY;
    }

    const text = result.text?.trim();
    if (!text) throw new Error("gemini_empty_response");

    return text;
  } catch (err) {
    log.error("gemini.failed", {
      latencyMs: Date.now() - startTime,
      err: (err as Error).message,
    });
    return DEFAULT_REPLY;
  }
}
