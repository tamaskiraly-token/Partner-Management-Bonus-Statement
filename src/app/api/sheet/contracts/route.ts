import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SHEET_ID = "1sw75A_S9dI29fuYTV_72izWkl6kSifpI";
const DEFAULT_GID = "1961903341";

type ContractRow = {
  contractualId: string;
  salesPerson: string;
  clientLegalName: string;
  contractCurrency: string;
  contractDateISO: string; // YYYY-MM-DD
  term: number; // months/term count (G)
  acvTotal: number; // H + I
};

type ContractsByOwnerResponse = {
  bySalesPerson: Record<string, ContractRow[]>;
  salesPeople: string[];
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

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.replace(/,/g, "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDateToISO(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;

  // DD/MM/YYYY
  const m1 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const day = Number(m1[1]);
    const month = Number(m1[2]);
    const year = Number(m1[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (Number.isFinite(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // YYYY-MM-DD
  const m2 = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const year = Number(m2[1]);
    const month = Number(m2[2]);
    const day = Number(m2[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (Number.isFinite(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // Excel serial date (best-effort): days since 1899-12-30
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    if (Number.isFinite(serial)) {
      const utcDays = Math.floor(serial);
      const utcSeconds = Math.round((serial - utcDays) * 86400);
      const epoch = Date.UTC(1899, 11, 30);
      const dt = new Date(epoch + utcDays * 86400 * 1000 + utcSeconds * 1000);
      if (Number.isFinite(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const gid = url.searchParams.get("gid") ?? DEFAULT_GID;

  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(
    gid,
  )}`;

  const res = await fetch(csvUrl, { method: "GET" });
  if (!res.ok) {
    return NextResponse.json({ error: `Failed to fetch sheet CSV (${res.status})` }, { status: 502 });
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV is empty" }, { status: 500 });
  }

  // Expect columns:
  // A=Contractual UID (active)
  // B=Deal owner / sales person
  // C=Client Legal Name
  // E=Contract date (used for current/prior filtering)
  // F=Contract currency
  // G=Term count (used for commission rate)
  // H+I=ACV parts (summed into one ACV)
  const rows: ContractRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const contractualId = cols[0] ? normalizeName(cols[0]) : "";
    const salesPerson = cols[1] ? normalizeName(cols[1]) : "";
    const clientLegalName = cols[2] ? cols[2].trim() : "";
    const contractCurrency = cols[5] ? normalizeName(cols[5]) : "";
    const contractDateISO = parseDateToISO(cols[4]);
    const term = toNumber(cols[6]) ?? 0;
    const h = toNumber(cols[7]) ?? 0;
    const acvI = toNumber(cols[8]) ?? 0;
    // ACV = H + 12 * I (H is annual, I is monthly -> annualized by *12)
    const acvTotal = h + 12 * acvI;

    if (!contractualId || !salesPerson || !clientLegalName || !contractCurrency || !contractDateISO) continue;

    rows.push({
      contractualId,
      salesPerson,
      clientLegalName,
      contractCurrency,
      contractDateISO,
      term,
      acvTotal,
    });
  }

  rows.sort((a, b) => a.contractDateISO.localeCompare(b.contractDateISO));

  const bySalesPerson: Record<string, ContractRow[]> = {};
  for (const r of rows) {
    bySalesPerson[r.salesPerson] ??= [];
    bySalesPerson[r.salesPerson].push(r);
  }

  const salesPeople = Object.keys(bySalesPerson).sort();

  const payload: ContractsByOwnerResponse = { bySalesPerson, salesPeople };
  return NextResponse.json(payload);
}

