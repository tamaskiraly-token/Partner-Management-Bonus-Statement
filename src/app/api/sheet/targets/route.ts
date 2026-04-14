import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SHEET_ID = "1sw75A_S9dI29fuYTV_72izWkl6kSifpI";
const DEFAULT_GID = "641207863";

type QuarterTargetsUSD = {
  Q1: number;
  Q2: number;
  Q3: number;
  Q4: number;
};

type SheetTargetsResponse = {
  dealOwners: string[];
  inYearRevenueTargetsByOwner: Record<string, QuarterTargetsUSD>;
  arrTargetQ4ByOwner: Record<string, number>;
};

function parseCsvRow(line: string): string[] {
  // Minimal CSV parser handling quotes.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Toggle unless it's an escaped quote.
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

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.replace(/,/g, "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const gid = url.searchParams.get("gid") ?? DEFAULT_GID;

  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(
    gid,
  )}`;

  const res = await fetch(csvUrl, { method: "GET" });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to fetch sheet CSV (${res.status})` },
      { status: 502 },
    );
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV is empty" }, { status: 500 });
  }

  // Expect columns: A=Target Type, B=Deal owner, C=Q1, D=Q2, E=Q3, F=Q4, G=TOTAL
  const owners = new Map<string, QuarterTargetsUSD>();
  const arrTargetQ4ByOwner: Record<string, number> = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const targetType = cols[0];
    const dealOwner = cols[1];
    if (!targetType || !dealOwner) continue;

    const q1 = toNumber(cols[2]);
    const q2 = toNumber(cols[3]);
    const q3 = toNumber(cols[4]);
    const q4 = toNumber(cols[5]);

    if (targetType === "In Year Revenue") {
      if (q1 == null || q2 == null || q3 == null || q4 == null) continue;
      owners.set(dealOwner, { Q1: q1, Q2: q2, Q3: q3, Q4: q4 });
    }

    if (targetType === "ARR Target" && q4 != null) {
      // Use Q4 for the annual ARR target bonus (as requested).
      arrTargetQ4ByOwner[dealOwner] = q4;
    }
  }

  const dealOwners = Array.from(new Set([...owners.keys(), ...Object.keys(arrTargetQ4ByOwner)])).sort();

  // Ensure every owner has all values (fallback to 0).
  const inYearRevenueTargetsByOwner: Record<string, QuarterTargetsUSD> = {};
  for (const o of dealOwners) {
    const t = owners.get(o) ?? { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    inYearRevenueTargetsByOwner[o] = t;
  }

  const payload: SheetTargetsResponse = {
    dealOwners,
    inYearRevenueTargetsByOwner,
    arrTargetQ4ByOwner,
  };

  return NextResponse.json(payload);
}

