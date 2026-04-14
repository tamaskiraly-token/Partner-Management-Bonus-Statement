"use client";

import * as React from "react";
import type { QuarterId } from "@/lib/quarters";
import { formatCurrency } from "@/lib/templateFormatting";

const REVENUE_CURRENCY = "USD";
const QUARTERLY_OTE_GBP = 4000;
const THRESHOLD_PCT = 0.8;

function payoutCurrencyForPartnerManager(partnerManager: string): string {
  // Special-case per request:
  // - GODILIER, Tracey: EUR payout
  // - everyone else: GBP payout
  return partnerManager === "GODILIER, Tracey" ? "EUR" : "GBP";
}

function formatRevenueUSD(n: number): string {
  if (!Number.isFinite(n)) return "—";
  // Use "$" (not "US$") as requested.
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(n);
}

type MonthKey = `${number}-${string}`; // YYYY-MM

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

type QuarterKey = "Q1" | "Q2" | "Q3" | "Q4";

type QuarterCalc = {
  quarter: QuarterId;
  quarterKey: QuarterKey;
  target: number;
  actual: number;
  achievement: number; // 0..inf
  isAboveThreshold: boolean;
  payoutPct: number; // 0..inf
  payoutBeforeRevenueCapGBP: number;
  payoutGBP: number;
  revenueCapApplied: boolean;
  quarterlyCapApplied: boolean;
};

type FullYearCalc = {
  fullYearTarget: number;
  fullYearActual: number;
  fullYearAchievement: number;
  fullYearTargetMet: boolean;
  ytdTarget: number;
  ytdActual: number;
  ytdAchievement: number;
  q4TrueUpEligible: boolean;
  q4TrueUpGBP: number;
};

function monthKeyToQuarterKey(monthKey: MonthKey): QuarterKey | null {
  const mm = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(mm)) return null;
  if (mm >= 1 && mm <= 3) return "Q1";
  if (mm >= 4 && mm <= 6) return "Q2";
  if (mm >= 7 && mm <= 9) return "Q3";
  if (mm >= 10 && mm <= 12) return "Q4";
  return null;
}

function quarterIdToQuarterKey(q: QuarterId): QuarterKey {
  return q.endsWith("Q1") ? "Q1" : q.endsWith("Q2") ? "Q2" : q.endsWith("Q3") ? "Q3" : "Q4";
}

function quarterIdToPeriodLabel(q: QuarterId): { start: string; end: string; label: string } {
  const map: Record<QuarterId, { start: string; end: string; label: string }> = {
    "2026Q1": { start: "01/01/2026", end: "31/03/2026", label: "Jan–Mar 2026" },
    "2026Q2": { start: "01/04/2026", end: "30/06/2026", label: "Apr–Jun 2026" },
    "2026Q3": { start: "01/07/2026", end: "30/09/2026", label: "Jul–Sep 2026" },
    "2026Q4": { start: "01/10/2026", end: "31/12/2026", label: "Oct–Dec 2026" },
  };
  return map[q];
}

function safePct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function calcQuarterForPm(args: {
  quarter: QuarterId;
  monthKeys: MonthKey[];
  rowsForPm: PmBonusClientRow[];
}): QuarterCalc {
  const { quarter, monthKeys, rowsForPm } = args;
  const quarterKey = quarterIdToQuarterKey(quarter);
  const quarterMonthKeys = monthKeys.filter((mk) => monthKeyToQuarterKey(mk) === quarterKey);

  let target = 0;
  let actual = 0;

  for (const row of rowsForPm) {
    for (const mk of quarterMonthKeys) {
      const m = row.months[mk];
      if (!m) continue;
      target += m.target ?? 0;
      actual += m.actual ?? 0;
    }
  }

  const achievement = target > 0 ? actual / target : 0;
  const isAboveThreshold = achievement >= THRESHOLD_PCT;

  // Base linear payout:
  // - below 80% -> 0
  // - Q1–Q3 capped at 100%
  // - Q4 uncapped
  const isQ4 = quarterKey === "Q4";
  const payoutPctRaw = isAboveThreshold ? achievement : 0;
  const payoutPctCapped = isQ4 ? payoutPctRaw : Math.min(payoutPctRaw, 1);
  const quarterlyCapApplied = !isQ4 && payoutPctRaw > 1;

  const payoutBeforeRevenueCapGBP = payoutPctCapped * QUARTERLY_OTE_GBP;
  const payoutRevenueCappedGBP = payoutBeforeRevenueCapGBP;
  const revenueCapApplied = false;

  return {
    quarter,
    quarterKey,
    target,
    actual,
    achievement,
    isAboveThreshold,
    payoutPct: payoutPctCapped,
    payoutBeforeRevenueCapGBP,
    payoutGBP: payoutRevenueCappedGBP,
    revenueCapApplied,
    quarterlyCapApplied,
  };
}

function calcFullYearForPm(args: {
  quarter: QuarterId;
  monthKeys: MonthKey[];
  rowsForPm: PmBonusClientRow[];
}): { fullYear: FullYearCalc; quarters: Record<QuarterKey, QuarterCalc> } {
  const { quarter, monthKeys, rowsForPm } = args;

  const quarters: Record<QuarterKey, QuarterCalc> = {
    Q1: calcQuarterForPm({ quarter: "2026Q1", monthKeys, rowsForPm }),
    Q2: calcQuarterForPm({ quarter: "2026Q2", monthKeys, rowsForPm }),
    Q3: calcQuarterForPm({ quarter: "2026Q3", monthKeys, rowsForPm }),
    Q4: calcQuarterForPm({ quarter: "2026Q4", monthKeys, rowsForPm }),
  };

  const fullYearTarget = quarters.Q1.target + quarters.Q2.target + quarters.Q3.target + quarters.Q4.target;
  const fullYearActual = quarters.Q1.actual + quarters.Q2.actual + quarters.Q3.actual + quarters.Q4.actual;
  const fullYearAchievement = fullYearTarget > 0 ? fullYearActual / fullYearTarget : 0;
  const fullYearTargetMet = fullYearAchievement >= 1;

  const activeQuarterKey = quarterIdToQuarterKey(quarter);
  const ytdTarget =
    activeQuarterKey === "Q1"
      ? quarters.Q1.target
      : activeQuarterKey === "Q2"
        ? quarters.Q1.target + quarters.Q2.target
        : activeQuarterKey === "Q3"
          ? quarters.Q1.target + quarters.Q2.target + quarters.Q3.target
          : fullYearTarget;

  const ytdActual =
    activeQuarterKey === "Q1"
      ? quarters.Q1.actual
      : activeQuarterKey === "Q2"
        ? quarters.Q1.actual + quarters.Q2.actual
        : activeQuarterKey === "Q3"
          ? quarters.Q1.actual + quarters.Q2.actual + quarters.Q3.actual
          : fullYearActual;

  const ytdAchievement = ytdTarget > 0 ? ytdActual / ytdTarget : 0;

  const q4TrueUpEligible = activeQuarterKey === "Q4" && fullYearTargetMet;
  const alreadyPaidQ1toQ3 = quarters.Q1.payoutGBP + quarters.Q2.payoutGBP + quarters.Q3.payoutGBP;
  const maxOteQ1toQ3 = 3 * QUARTERLY_OTE_GBP;
  const q4TrueUpGBP = q4TrueUpEligible ? Math.max(0, maxOteQ1toQ3 - alreadyPaidQ1toQ3) : 0;

  return {
    quarters,
    fullYear: {
      fullYearTarget,
      fullYearActual,
      fullYearAchievement,
      fullYearTargetMet,
      ytdTarget,
      ytdActual,
      ytdAchievement,
      q4TrueUpEligible,
      q4TrueUpGBP,
    },
  };
}

function SummaryRow({ label, value, sectionId }: { label: string; value: string; sectionId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById(sectionId);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-left transition hover:bg-white"
    >
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <span className="text-xs font-bold text-slate-900">{value}</span>
    </button>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8" id={id}>
      <div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-slate-600">{title}</div>
      {children}
    </div>
  );
}

function OteQuarterTable({ calc, payoutCurrency }: { calc: QuarterCalc; payoutCurrency: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[680px] border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] text-slate-600">
            <th className="w-[120px] px-3 py-2 font-semibold">Quarter</th>
            <th className="w-[140px] px-3 py-2 font-semibold">Target</th>
            <th className="w-[140px] px-3 py-2 font-semibold">Actual</th>
            <th className="w-[120px] px-3 py-2 font-semibold">Achievement</th>
            <th className="w-[160px] px-3 py-2 font-semibold">Threshold (80%)</th>
            <th className="w-[200px] px-3 py-2 font-semibold">OTE payout</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-slate-200 text-[11px] text-slate-700">
            <td className="px-3 py-2 font-semibold text-slate-900">{calc.quarter}</td>
            <td className="px-3 py-2 tabular-nums">{formatRevenueUSD(calc.target)}</td>
            <td className="px-3 py-2 tabular-nums">{formatRevenueUSD(calc.actual)}</td>
            <td className="px-3 py-2 tabular-nums">{safePct(calc.achievement)}</td>
            <td className="px-3 py-2">
              {calc.isAboveThreshold ? (
                <span className="font-semibold text-emerald-700">above</span>
              ) : (
                <span className="font-semibold text-rose-700">below</span>
              )}
            </td>
            <td className="px-3 py-2 tabular-nums font-bold text-slate-900">
              {formatCurrency(Math.round(calc.payoutGBP), payoutCurrency)}
              {calc.quarterlyCapApplied ? <span className="ml-2 text-slate-500 font-semibold">(capped at 100%)</span> : null}
              {calc.revenueCapApplied ? <span className="ml-2 text-slate-500 font-semibold">(capped by revenue)</span> : null}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function monthKeyToLabel(monthKey: MonthKey): string {
  // YYYY-MM -> Mon YYYY
  const year = monthKey.slice(0, 4);
  const mm = Number(monthKey.slice(5, 7));
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const name = names[mm - 1] ?? monthKey;
  return `${name} ${year}`;
}

function QuarterlyClientBreakdownTable({
  quarter,
  monthKeys,
  rowsForPm,
}: {
  quarter: QuarterId;
  monthKeys: MonthKey[];
  rowsForPm: PmBonusClientRow[];
}) {
  const quarterKey = quarterIdToQuarterKey(quarter);
  const quarterMonthKeys = monthKeys.filter((mk) => monthKeyToQuarterKey(mk) === quarterKey);

  const totals = rowsForPm.reduce(
    (acc, row) => {
      for (const mk of quarterMonthKeys) {
        const m = row.months[mk];
        if (!m) continue;
        acc.target += m.target ?? 0;
        acc.actual += m.actual ?? 0;
      }
      return acc;
    },
    { target: 0, actual: 0 },
  );

  const totalAchievement = totals.target > 0 ? totals.actual / totals.target : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse table-fixed text-[10px]">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] text-slate-600">
            <th className="w-[160px] px-3 py-2 font-semibold" rowSpan={2}>
              Client
            </th>
            {quarterMonthKeys.map((mk) => (
              <th
                key={`${mk}-group`}
                className="px-3 py-2 font-semibold text-center border-l border-slate-300"
                colSpan={3}
              >
                {monthKeyToLabel(mk)}
              </th>
            ))}
            <th className="w-[130px] px-3 py-2 font-semibold text-center border-l border-slate-300" rowSpan={2}>
              Quarter target
            </th>
            <th className="w-[130px] px-3 py-2 font-semibold text-center" rowSpan={2}>
              Quarter actual
            </th>
            <th className="w-[90px] px-3 py-2 font-semibold text-center" rowSpan={2}>
              Ach.
            </th>
          </tr>
          <tr className="bg-slate-50 text-left text-[10px] text-slate-600">
            {quarterMonthKeys.map((mk) => (
              <React.Fragment key={`${mk}-sub`}>
                <th className="w-[110px] px-3 py-2 font-semibold text-center border-l border-slate-300">Target</th>
                <th className="w-[110px] px-3 py-2 font-semibold text-center">Actual</th>
                <th className="w-[110px] px-3 py-2 font-semibold text-center border-r border-slate-300">Diff</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowsForPm
            .slice()
            .sort((a, b) => a.clientName.localeCompare(b.clientName))
            .map((row) => {
              let qTarget = 0;
              let qActual = 0;
              for (const mk of quarterMonthKeys) {
                const m = row.months[mk];
                if (!m) continue;
                qTarget += m.target ?? 0;
                qActual += m.actual ?? 0;
              }
              const ach = qTarget > 0 ? qActual / qTarget : 0;

              return (
                <tr key={row.clientName} className="border-t border-slate-200 text-[11px] text-slate-700">
                  <td className="px-3 py-2 font-semibold text-slate-900 truncate" title={row.clientName}>
                    {row.clientName}
                  </td>
                  {quarterMonthKeys.map((mk) => {
                    const t = row.months[mk]?.target ?? 0;
                    const a = row.months[mk]?.actual ?? 0;
                    const d = a - t;
                    const diffTone =
                      d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-slate-700";
                    return (
                      <React.Fragment key={`${row.clientName}-${mk}-tri`}>
                        <td className="px-3 py-2 tabular-nums text-center border-l border-slate-300">
                          {formatRevenueUSD(t)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-center">{formatRevenueUSD(a)}</td>
                        <td
                          className={`px-3 py-2 tabular-nums text-center font-semibold border-r border-slate-300 ${diffTone}`}
                        >
                          {formatRevenueUSD(d)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="px-3 py-2 tabular-nums text-center font-semibold border-l border-slate-300">
                    {formatRevenueUSD(qTarget)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-center font-semibold">
                    {formatRevenueUSD(qActual)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-center font-semibold">{safePct(ach)}</td>
                </tr>
              );
            })}

          <tr className="border-t border-slate-300 bg-slate-50 text-[11px]">
            <td className="px-3 py-2 font-bold text-slate-900">TOTAL</td>
            {quarterMonthKeys.map((mk) => {
              const t = rowsForPm.reduce((acc, r) => acc + (r.months[mk]?.target ?? 0), 0);
              const a = rowsForPm.reduce((acc, r) => acc + (r.months[mk]?.actual ?? 0), 0);
              const d = a - t;
              const diffTone =
                d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-slate-900";
              return (
                <React.Fragment key={`${mk}-tot-tri`}>
                  <td className="px-3 py-2 tabular-nums text-center font-bold text-slate-900 border-l border-slate-300">
                    {formatRevenueUSD(t)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-center font-bold text-slate-900">
                    {formatRevenueUSD(a)}
                  </td>
                  <td className={`px-3 py-2 tabular-nums text-center font-bold border-r border-slate-300 ${diffTone}`}>
                    {formatRevenueUSD(d)}
                  </td>
                </React.Fragment>
              );
            })}
            <td className="px-3 py-2 tabular-nums text-center font-bold text-slate-900 border-l border-slate-300">
              {formatRevenueUSD(totals.target)}
            </td>
            <td className="px-3 py-2 tabular-nums text-center font-bold text-slate-900">
              {formatRevenueUSD(totals.actual)}
            </td>
            <td className="px-3 py-2 tabular-nums text-center font-bold text-slate-900">
              {safePct(totalAchievement)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FullYearOteTable({
  fullYear,
  isRelevant,
  payoutCurrency,
}: {
  fullYear: FullYearCalc;
  isRelevant: boolean;
  payoutCurrency: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[680px] border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] text-slate-600">
            <th className="w-[220px] px-3 py-2 font-semibold">Scope</th>
            <th className="w-[140px] px-3 py-2 font-semibold">Target</th>
            <th className="w-[140px] px-3 py-2 font-semibold">Actual</th>
            <th className="w-[120px] px-3 py-2 font-semibold">Achievement</th>
            <th className="w-[260px] px-3 py-2 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-slate-200 text-[11px] text-slate-700">
            <td className="px-3 py-2 font-semibold text-slate-900">Year-to-date</td>
            <td className="px-3 py-2 tabular-nums">{isRelevant ? formatRevenueUSD(fullYear.ytdTarget) : "—"}</td>
            <td className="px-3 py-2 tabular-nums">{isRelevant ? formatRevenueUSD(fullYear.ytdActual) : "—"}</td>
            <td className="px-3 py-2 tabular-nums">{isRelevant ? safePct(fullYear.ytdAchievement) : "—"}</td>
            <td className="px-3 py-2 text-slate-600">Up to current quarter end</td>
          </tr>
          <tr className="border-t border-slate-200 text-[11px] text-slate-700">
            <td className="px-3 py-2 font-semibold text-slate-900">Full year</td>
            <td className="px-3 py-2 tabular-nums">{isRelevant ? formatRevenueUSD(fullYear.fullYearTarget) : "—"}</td>
            <td className="px-3 py-2 tabular-nums">{isRelevant ? formatRevenueUSD(fullYear.fullYearActual) : "—"}</td>
            <td className="px-3 py-2 tabular-nums">{isRelevant ? safePct(fullYear.fullYearAchievement) : "—"}</td>
            <td className="px-3 py-2">
              {isRelevant ? (
                fullYear.fullYearTargetMet ? (
                  <span className="font-semibold text-emerald-700">Full-year target met</span>
                ) : (
                  <span className="font-semibold text-rose-700">Full-year target not met</span>
                )
              ) : (
                <span className="font-semibold text-slate-500">Not relevant this quarter</span>
              )}
            </td>
          </tr>
          <tr className="border-t border-slate-300 bg-slate-50 text-[11px]">
            <td className="px-3 py-2 font-bold text-slate-900">Q4 retrospective true-up</td>
            <td className="px-3 py-2" colSpan={3}>
              {isRelevant && fullYear.q4TrueUpEligible ? (
                <span className="text-slate-700">
                  Eligible (tops up Q1–Q3 to 100% OTE)
                </span>
              ) : (
                <span className="text-slate-500">Not applicable</span>
              )}
            </td>
            <td className="px-3 py-2 font-bold tabular-nums text-slate-900">
              {isRelevant && fullYear.q4TrueUpEligible ? formatCurrency(Math.round(fullYear.q4TrueUpGBP), payoutCurrency) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PartnerManagementBonusStatementTemplate({ quarter }: { quarter: QuarterId }) {
  const [showAllSections, setShowAllSections] = React.useState(true);
  const [pmFilter, setPmFilter] = React.useState<string>(""); // id == name for simplicity

  const [inputs, setInputs] = React.useState<PmBonusInputResponse | null>(null);
  const [inputsError, setInputsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sheet/pm-bonus-input?gid=0");
        if (!res.ok) throw new Error(`Failed to load sheet: ${res.status}`);
        const data = (await res.json()) as PmBonusInputResponse;
        if (cancelled) return;
        setInputs(data);
      } catch (e) {
        if (cancelled) return;
        setInputsError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (pmFilter) return;
    if (inputs?.partnerManagers?.length) setPmFilter(inputs.partnerManagers[0]);
  }, [inputs, pmFilter]);

  const activePmName = pmFilter === "ALL" || !pmFilter ? "All Partner Managers" : pmFilter;

  const rowsForActivePm = React.useMemo(() => {
    const rows = inputs?.rows ?? [];
    if (pmFilter === "ALL" || !pmFilter) return rows;
    return rows.filter((r) => r.partnerManager === pmFilter);
  }, [inputs, pmFilter]);

  const { quarters, fullYear } = React.useMemo(() => {
    const monthKeys = inputs?.monthKeys ?? [];
    return calcFullYearForPm({ quarter, monthKeys, rowsForPm: rowsForActivePm });
  }, [quarter, inputs, rowsForActivePm]);

  const activeQuarterKey = quarterIdToQuarterKey(quarter);
  const activeQuarterCalc = quarters[activeQuarterKey];
  const periodLabel = quarterIdToPeriodLabel(quarter);
  const quarterMonthKeys = (inputs?.monthKeys ?? []).filter((mk) => monthKeyToQuarterKey(mk) === activeQuarterKey);
  const isQ4 = activeQuarterKey === "Q4";
  const payoutCurrency = payoutCurrencyForPartnerManager(pmFilter);

  const exportToExcel = () => {
    try {
      if (!inputs) return;

      const csvEscape = (value: unknown) => {
        const s = value === null || value === undefined ? "" : String(value);
        return `"${s.replace(/"/g, '""')}"`;
      };
      const makeRow = (cells: unknown[]) => cells.map(csvEscape).join(",");

      const sections: string[] = [];
      sections.push(makeRow(["Quarter", quarter]));
      sections.push(makeRow(["Partner Manager", activePmName]));
      sections.push(makeRow(["Revenue currency", REVENUE_CURRENCY]));
      sections.push(makeRow(["Payout currency", payoutCurrency]));
      sections.push("");

      sections.push("Quarterly On-Target-Earnings (OTE)");
      sections.push(makeRow(["Target", activeQuarterCalc.target]));
      sections.push(makeRow(["Actual", activeQuarterCalc.actual]));
      sections.push(makeRow(["AchievementPct", activeQuarterCalc.achievement]));
      sections.push(makeRow(["AboveThreshold80Pct", activeQuarterCalc.isAboveThreshold ? "yes" : "no"]));
      sections.push(makeRow(["PayoutGBP", Math.round(activeQuarterCalc.payoutGBP)]));
      sections.push("");

      sections.push("Full year On-Target-Earnings (OTE)");
      sections.push(makeRow(["RelevantInQuarter", isQ4 ? "yes" : "no (Q4 only)"]));
      sections.push(makeRow(["YTD_Target", isQ4 ? fullYear.ytdTarget : "—"]));
      sections.push(makeRow(["YTD_Actual", isQ4 ? fullYear.ytdActual : "—"]));
      sections.push(makeRow(["YTD_AchievementPct", isQ4 ? fullYear.ytdAchievement : "—"]));
      sections.push(makeRow(["FY_Target", isQ4 ? fullYear.fullYearTarget : "—"]));
      sections.push(makeRow(["FY_Actual", isQ4 ? fullYear.fullYearActual : "—"]));
      sections.push(makeRow(["FY_AchievementPct", isQ4 ? fullYear.fullYearAchievement : "—"]));
      sections.push(makeRow(["FY_TargetMet", isQ4 ? (fullYear.fullYearTargetMet ? "yes" : "no") : "—"]));
      sections.push(makeRow(["Q4_TrueUpGBP", isQ4 ? Math.round(fullYear.q4TrueUpGBP) : "—"]));
      sections.push("");

      sections.push("New Business Wins");
      sections.push(makeRow(["Status", "No data yet"]));

      const csv = sections.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const safeQuarter = quarter.replace(/[^A-Za-z0-9_-]/g, "_");
      const safePm = activePmName.replace(/[^A-Za-z0-9_-]/g, "_");
      const fileName = `partner_management_bonus_statement_${safeQuarter}_${safePm}.csv`;

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Export failed");
      console.error(e);
    }
  };

  return (
    <div className="statement-page mx-auto flex min-h-screen w-full max-w-[1400px] flex-1 flex-col px-6 py-8">
      <div className="mb-6 no-print flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2">
            <span className="relative inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
              <span className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-sky-200/70 via-white to-sky-200/70 opacity-80 blur-[10px]" />
              Partner Management Bonus Statement
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            {quarter} partner management bonus statement
          </h1>
          <div className="mt-1 text-sm text-slate-600">
            {!inputs ? "Loading bonus inputs…" : periodLabel.label}
          </div>
          {inputsError ? <div className="mt-1 text-sm text-red-600">{inputsError}</div> : null}

          <div className="mt-4 flex items-center gap-3">
            <label htmlFor="pmFilter" className="text-sm font-semibold text-slate-700">
              Partner Manager
            </label>
            <select
              id="pmFilter"
              value={pmFilter}
              onChange={(e) => setPmFilter(e.target.value)}
              className="h-10 min-w-[260px] rounded-xl border border-slate-200 bg-white/70 px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none ring-0 transition hover:bg-white"
            >
              <option value="ALL">All</option>
              {pmFilter === "" ? <option value="" disabled /> : null}
              {(inputs?.partnerManagers ?? []).map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="no-print flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => {
              const body = document.body;
              body.classList.add("print-only-statement");
              const cleanup = () => body.classList.remove("print-only-statement");
              window.addEventListener("afterprint", cleanup, { once: true });
              window.print();
            }}
            className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Generate PDF (Print)
          </button>

          <button
            type="button"
            onClick={exportToExcel}
            disabled={!inputs}
            className="disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer rounded-xl border border-slate-200 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white"
          >
            Export to Excel (CSV)
          </button>

          <button
            type="button"
            onClick={() => setShowAllSections((v) => !v)}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white"
          >
            {showAllSections ? "Collapse all sections" : "Expand all sections"}
          </button>
        </div>
      </div>

      <div id="statement-root" className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-sm">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <div className="text-sm font-extrabold tracking-wide text-slate-900">
              QUARTERLY PARTNER MANAGEMENT BONUS STATEMENT
            </div>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              PARTNER MANAGER
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">{activePmName}</div>
          </div>

          <div className="md:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              REPORTING PERIOD START
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">{periodLabel.start}</div>

            <div className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              REPORTING PERIOD END
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">{periodLabel.end}</div>
          </div>

          <div className="md:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Statement currency</div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {REVENUE_CURRENCY} revenue / {payoutCurrency} payout
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">SUMMARY</div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-1">
              <SummaryRow
                label="1) Quarterly OTE payout"
                value={formatCurrency(Math.round(activeQuarterCalc.payoutGBP), payoutCurrency)}
                sectionId="quarterly-ote"
              />
              <SummaryRow
                label="2) Full year OTE payout"
                value={isQ4 ? formatCurrency(Math.round(fullYear.q4TrueUpGBP), payoutCurrency) : "—"}
                sectionId="full-year-ote"
              />
              <SummaryRow
                label="3) New Business Wins payout"
                value="—"
                sectionId="new-business-wins"
              />
            </div>

            <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-bold text-slate-900">
              TOTAL PAYOUT&nbsp;
              <span className="font-extrabold">
                {formatCurrency(
                  Math.round(activeQuarterCalc.payoutGBP + (isQ4 ? fullYear.q4TrueUpGBP : 0)),
                  payoutCurrency,
                )}
              </span>
            </div>
          </div>
        </div>

        {showAllSections && (
          <>
            <Section id="quarterly-ote" title="1) QUARTERLY ON-TARGET-EARNINGS (OTE)">
              <OteQuarterTable calc={activeQuarterCalc} payoutCurrency={payoutCurrency} />
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-1.5 rounded-full bg-sky-400" aria-hidden />
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-widest text-slate-700">
                        1A) Client breakdown
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        Monthly target vs actual (USD) for all clients under the selected Partner Manager
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <QuarterlyClientBreakdownTable
                    quarter={quarter}
                    monthKeys={inputs?.monthKeys ?? []}
                    rowsForPm={rowsForActivePm}
                  />
                </div>

                {quarterMonthKeys.length === 0 ? (
                  <div className="mt-2 text-xs text-slate-600">No month columns detected for this quarter in the sheet.</div>
                ) : null}
              </div>

              <div className="mt-3 text-xs text-slate-600">
                Result is linear above 80%. Q1–Q3 are capped at 100% of OTE. Q4 is uncapped and may trigger retrospective true-up if full-year target is met.
              </div>
            </Section>

            <Section id="full-year-ote" title="2) FULL YEAR ON-TARGET-EARNINGS (OTE)">
              {!isQ4 ? (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  This section is shown for reference. Full-year OTE and Q4 retrospective true-up are only relevant in Q4.
                </div>
              ) : null}
              <FullYearOteTable fullYear={fullYear} isRelevant={isQ4} payoutCurrency={payoutCurrency} />
            </Section>

            <Section id="new-business-wins" title="3) NEW BUSINESS WINS">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                No data yet. This section will be wired once you provide the new New Business Wins data structure.
              </div>
            </Section>
          </>
        )}

        {!showAllSections && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Sections are collapsed. Use “Expand all sections” to replicate the PDF layout.
          </div>
        )}
      </div>
    </div>
  );
}

