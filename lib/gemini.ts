import { GoogleGenAI } from "@google/genai";

// ตรวจสอบชื่อ model ที่ถูกต้องใน Google AI Studio ก่อน deploy
const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 8_000;
const DEFAULT_REPLY = "ขออภัยค่ะ เรื่องนี้ขอให้แอดมินติดต่อกลับไปนะคะ";

function buildPrompt(faqCsvString: string, userMessage: string): string {
  return `<role>
คุณคือพนักงานร้านค้าออนไลน์ ทำหน้าที่ตอบคำถามลูกค้าทาง LINE
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งเติมราคา เวลาจัดส่ง หรือรายละเอียดที่ไม่มีใน FAQ
- ถ้าคำถามไม่มีคำตอบใน FAQ ให้ตอบด้วยข้อความนี้เท่านั้น: "ขออภัยค่ะ เรื่องนี้ขอให้แอดมินติดต่อกลับไปนะคะ"
- โทนภาษา: สุภาพทางการ ใช้คำลงท้าย ค่ะ/ครับ ห้ามใช้ emoji
- ความยาวคำตอบ 1-3 ประโยค
</constraints>

<output_format>
ตอบเป็นภาษาไทย ห้ามใช้ markdown หรือสัญลักษณ์จัดรูปแบบใด ๆ
</output_format>

<faq>
${faqCsvString}
</faq>

<question>
${userMessage}
</question>`;
}

export async function askGemini(
  faqCsvString: string,
  userMessage: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Gemini timeout")), TIMEOUT_MS)
  );

  try {
    const result = await Promise.race([
      ai.models.generateContent({
        model: MODEL,
        contents: buildPrompt(faqCsvString, userMessage),
        config: {
          temperature: 1.0,
          maxOutputTokens: 1024,
        },
      }),
      timeoutPromise,
    ]);

    const candidate = result.candidates?.[0];
    const finishReason = candidate?.finishReason ?? "UNKNOWN";
    const thoughtsTokenCount = result.usageMetadata?.thoughtsTokenCount;
    const candidatesTokenCount = result.usageMetadata?.candidatesTokenCount;

    console.log(
      `[gemini] ${new Date().toISOString()} finishReason=${finishReason} thoughtsTokenCount=${thoughtsTokenCount} candidatesTokenCount=${candidatesTokenCount}`
    );

    if (finishReason === "MAX_TOKENS") {
      return DEFAULT_REPLY;
    }

    const text = candidate?.content?.parts?.[0]?.text?.trim();
    return text || DEFAULT_REPLY;
  } catch (err) {
    console.error(`[gemini] ${new Date().toISOString()} error:`, err);
    return DEFAULT_REPLY;
  }
}
