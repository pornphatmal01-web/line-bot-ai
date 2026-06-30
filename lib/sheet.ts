import { FaqRow } from "@/types";

let cache: FaqRow[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

function parseCsvRfc4180(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
      } else if (ch === "\r" && text[i + 1] === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i += 2;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function parseSheet(csv: string): FaqRow[] {
  // strip UTF-8 BOM that Google Sheets adds
  const cleaned = csv.replace(/^﻿/, "").trim();
  const rows = parseCsvRfc4180(cleaned);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  console.log(`[sheet] headers found: ${JSON.stringify(headers)}, total rows: ${rows.length - 1}`);

  const questionIdx = headers.indexOf("question");
  const answerIdx = headers.indexOf("answer");
  const categoryIdx = headers.indexOf("category");

  if (questionIdx === -1 || answerIdx === -1) {
    console.error(`[sheet] header mismatch — expected "question","answer" but got: ${JSON.stringify(headers)}`);
    return [];
  }

  return rows.slice(1).flatMap((row) => {
    const question = row[questionIdx]?.trim() ?? "";
    const answer = row[answerIdx]?.trim() ?? "";
    if (!question || !answer) return [];
    return [
      {
        question,
        answer,
        category: categoryIdx !== -1 ? (row[categoryIdx]?.trim() ?? "") : "",
      },
    ];
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
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    const text = await res.text();
    const rows = parseSheet(text);
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
  return rows
    .map((r) => {
      const prefix = r.category ? `[${r.category}] ` : "";
      return `${prefix}${r.question}\n→ ${r.answer}`;
    })
    .join("\n\n");
}
