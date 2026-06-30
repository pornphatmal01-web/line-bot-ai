import { messagingApi } from "@line/bot-sdk";
import { log } from "@/lib/log";

const HANDOFF_TRIGGERS = [
  "คุยกับคน",
  "คุยกับแอดมิน",
  "ต่อรอง",
  "ตัดราคา",
  "ขอส่วนลด",
  "คือแอดมิน",
  "ขอเจ้าหน้าที่",
  "ร้องเรียน",
  "ไม่พอใจ",
  "อยากคุยกัน",
  "ขายส่ง",
  "wholesale",
  "franchise",
  "สื่อมวลชน",
  "ขอเป็นตัวแทน",
  "ติดต่อสื่อ",
];

export function shouldHandoff(message: string): boolean {
  const lower = message.toLowerCase();
  return HANDOFF_TRIGGERS.some((t) => lower.includes(t));
}

export async function notifyAdmin(userId: string, userMessage: string) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) {
    log.warn("handoff.no_admin_group_id");
    return;
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) return;

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });

  try {
    await client.pushMessage({
      to: adminGroupId,
      messages: [
        {
          type: "text",
          text: `🔔 ลูกค้าต้องการคุยกับแอดมิน\n\nUserID: ${userId}\nข้อความ: ${userMessage}\n\nตอบที่: https://manager.line.biz/chats`,
        },
      ],
    });
  } catch (err) {
    log.error("handoff.notify_failed", { err: (err as Error).message });
  }
}
