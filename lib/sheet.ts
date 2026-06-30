import { FaqRow } from "@/types";

let cache: FaqRow[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

function parseCsv(csv: string): FaqRow[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row as unknown as FaqRow;
  });
}

export async function getFaqRows(): Promise<FaqRow[]> {
  const now = Date.now();
  if (cache && now - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }

  const url = process.env.SHEET_CSV_URL;
  if (!url) throw new Error("SHEET_CSV_URL is not set");

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    const text = await res.text();
    const rows = parseCsv(text);
    cache = rows;
    cacheTimestamp = now;
    return rows;
  } catch (err) {
    if (cache) {
      console.error(`[sheet] ${new Date().toISOString()} fetch failed, using stale cache:`, err);
      return cache;
    }
    throw err;
  }
}

export function faqToString(rows: FaqRow[]): string {
  return rows.map((r) => `Q: ${r.question}\nA: ${r.answer}`).join("\n\n");
}
