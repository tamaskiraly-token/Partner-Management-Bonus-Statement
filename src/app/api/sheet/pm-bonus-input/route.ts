import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SHEET_ID = "10ODPDPvyYhjKB1cIO14dy3DdO3e4dkoTFoUiLlKNKcE";
const DEFAULT_GID = "0";

type MonthKey = `${number}-${string}`; // e.g. 2026-01

type PmBonusClientRow = {
  clientName: string;
  partnerManager: string;
  months: Record<MonthKey, { actual: number; target: number }>;
};

type PmBonusInputResponse = {
  partnerManagers: string[];
  monthKeys: MonthKey[];
  rows: PmBonusClientRow[];
};

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function isIgnoredPartnerManager(name: string): boolean {
  const n = normalizeName(name).toLowerCase();
  return n === "long tail" || n === "#n/a" || n === "n/a" || n === "";
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.replace(/,/g, "").trim();
  if (!v || v === "-" || v === "—") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseHeaderDateToMonthKey(value: string | undefined): MonthKey | null {
  const v = (value ?? "").trim();
  if (!v) return null;

  // DD/MM/YYYY
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}` as MonthKey;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const gid = url.searchParams.get("gid") ?? DEFAULT_GID;

  // Prefer export endpoint: it returns full data reliably (gviz output may reflect active filters).
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${encodeURIComponent(gid)}`;

  const res = await fetch(csvUrl, { method: "GET" });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to fetch sheet CSV (${res.status})` },
      { status: 502 },
    );
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 3) {
    return NextResponse.json({ error: "CSV is empty or missing headers" }, { status: 500 });
  }

  const header1 = parseCsvRow(lines[0]);
  const header2 = parseCsvRow(lines[1]);

  const header2HasActualTarget = header2.some((c) => {
    const v = (c ?? "").trim().toLowerCase();
    return v === "actual" || v === "target";
  });

  // Expected:
  // - A: Client Name
  // - B: Partner Manager
  // - C..: repeating month columns like:
  //   "31/01/2026 Actual", "Target", "28/02/2026 Actual", "Target", ...
  const monthForCol: Array<MonthKey | null> = new Array(header1.length).fill(null);
  const kindForCol: Array<"actual" | "target" | null> = new Array(monthForCol.length).fill(null);

  let lastMonthKey: MonthKey | null = null;
  for (let col = 2; col < monthForCol.length; col++) {
    const raw = (header1[col] ?? "").trim();
    const raw2 = (header2[col] ?? "").trim();

    // Two-row header mode (export endpoint):
    // header1: dates in alternating columns, empty in between
    // header2: "Actual"/"Target" aligned to those columns
    if (header2HasActualTarget) {
      const monthCandidate = parseHeaderDateToMonthKey(raw);
      if (monthCandidate) lastMonthKey = monthCandidate;
      monthForCol[col] = lastMonthKey;

      const kind = raw2.toLowerCase();
      if (kind === "actual") kindForCol[col] = "actual";
      else if (kind === "target") kindForCol[col] = "target";
      else kindForCol[col] = null;
      continue;
    }

    // Single-row header mode (gviz endpoint):
    // Combined header: "DD/MM/YYYY Actual"
    const combined = raw.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s*(actual|target)\s*$/i);
    if (combined) {
      const mk = parseHeaderDateToMonthKey(combined[1]);
      if (mk) {
        lastMonthKey = mk;
        monthForCol[col] = mk;
        kindForCol[col] = combined[2].toLowerCase() === "actual" ? "actual" : "target";
        continue;
      }
    }

    // Standalone "Target" column (paired with the last seen month)
    const lowered = raw.toLowerCase();
    if (lowered === "target") {
      monthForCol[col] = lastMonthKey;
      kindForCol[col] = lastMonthKey ? "target" : null;
      continue;
    }

    // Sometimes the date may be in its own cell; keep best-effort support.
    const monthCandidate = parseHeaderDateToMonthKey(raw);
    if (monthCandidate) {
      lastMonthKey = monthCandidate;
      monthForCol[col] = monthCandidate;
      kindForCol[col] = null;
      continue;
    }

    monthForCol[col] = lastMonthKey;
    kindForCol[col] = null;
  }

  const monthKeys = Array.from(new Set(monthForCol.filter((x): x is MonthKey => Boolean(x)))).sort();

  const rows: PmBonusClientRow[] = [];
  const partnerManagersSet = new Set<string>();

  const dataStartIdx = header2HasActualTarget ? 2 : 1;
  for (let i = dataStartIdx; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const clientName = (cols[0] ?? "").trim();
    const partnerManagerRaw = (cols[1] ?? "").trim();
    if (!clientName || !partnerManagerRaw) continue;

    const partnerManager = normalizeName(partnerManagerRaw);
    if (isIgnoredPartnerManager(partnerManager)) continue;

    const months: PmBonusClientRow["months"] = {};
    for (let col = 2; col < monthForCol.length; col++) {
      const monthKey = monthForCol[col];
      const kind = kindForCol[col];
      if (!monthKey || !kind) continue;

      const n = toNumber(cols[col]);
      if (n == null) continue;

      months[monthKey] ??= { actual: 0, target: 0 };
      months[monthKey][kind] = n;
    }

    rows.push({ clientName, partnerManager, months });
    partnerManagersSet.add(partnerManager);
  }

  const partnerManagers = Array.from(partnerManagersSet).sort();

  const payload: PmBonusInputResponse = { partnerManagers, monthKeys, rows };
  return NextResponse.json(payload);
}

