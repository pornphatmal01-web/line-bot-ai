import { messagingApi } from "@line/bot-sdk";

function getClient(): messagingApi.MessagingApiClient {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  return new messagingApi.MessagingApiClient({ channelAccessToken });
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  const client = getClient();
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}
