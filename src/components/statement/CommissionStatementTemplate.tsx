"use client";

import * as React from "react";
import type { QuarterId } from "@/lib/quarters";
import { hashString, mulberry32 } from "@/lib/seededRandom";
import { formatCurrency } from "@/lib/templateFormatting";

type PersonRow = {
  id: string;
  name: string;
  role: string;
  currentPeriodBookings: number;
  priorReportingPeriodBookings: number;
  quarterlyInYearRevenueTarget: number;
  annualArrTarget: number;
  computed: {
    currentComponent: number;
    priorComponent: number;
    inYearTargetComponent: number;
    annualArrTargetComponent: number;
    totalCommission: number;
  };
  // Booking line items (placeholder until policy engine is wired).
  currentBookingLines: BookingLine[];
  priorBookingLines: BookingLine[];
  quarterlyBonusRows: QuarterlyBonusRow[];
  annualBonusRows: AnnualBonusRow[];
};

type BookingLine = {
  id: string;
  contractualId: string;
  clientName: string;
  bookingDate: string; // DD/MM/YYYY
  monthsSinceAcquisition: number;
  contractCurrency: string;
  acvCCY: number;
  acvLCY: number;
  volumeDrivenPct: number;
  revenueDrivenPct: number;
  commissionRatePct: number; // overall %
  commissionRateVolumeDrivenPct: number;
  commissionRateRevenueDrivenPct: number;
  commissionPayableLCY: number; // commission payable potential (LCY)
  commissionPayableLCYVolumeDriven: number;
  commissionPayableLCYRevenueDriven: number;
  cashSinceContractEntryLCY: number; // cash since contract entry (LCY)
  commissionPayableToDateLCY: number; // commission payable to-date (LCY)
  commissionToBePaidLCY: number; // commission to-be-paid (LCY)
  revenueThisPeriodLCY: number; // revenue this period (LCY)
  commissionPayableToDateLCYVolumeDriven: number; // volume-driven payable to-date (LCY)
  commissionToBePaidLCYVolumeDriven: number; // volume-driven to-be-paid (LCY)
  commissionPayableGBP: number; // total (GBP)
  commissionToBePaidThisQuarterGBP: number; // same for now, policy placeholder
  fxLCYtoGBP: number;
};

type QuarterlyBonusRow = {
  quarterEnd: string; // DD/MM/YYYY
  targetUSD: number;
  actualUSD: number;
  targetMet: boolean;
  commissionToBePaidThisQuarterGBP: number;
};

type AnnualBonusRow = {
  annualARRTargetUSD: number;
  quarterEnd: string; // DD/MM/YYYY
  targetUSD: number;
  actualUSD: number;
  targetMet: boolean;
  commissionToBePaidThisQuarterGBP: number;
};

const COMMISSION_CURRENCY = "GBP";

export function CommissionStatementTemplate({
  quarter,
}: {
  quarter: QuarterId;
}) {
  type QuarterTargetsUSD = { Q1: number; Q2: number; Q3: number; Q4: number };
  type SheetTargetsResponse = {
    dealOwners: string[];
    inYearRevenueTargetsByOwner: Record<string, QuarterTargetsUSD>;
    arrTargetQ4ByOwner: Record<string, number>;
  };

  type ContractRow = {
    contractualId: string;
    salesPerson: string;
    clientLegalName: string;
    contractCurrency: string;
    contractDateISO: string; // YYYY-MM-DD
    term: number; // G
    acvTotal: number; // H + I
  };

  type ContractsByOwnerResponse = {
    bySalesPerson: Record<string, ContractRow[]>;
    salesPeople: string[];
  };

  const [showAllSections, setShowAllSections] = React.useState(true);
  // Default to a single person so the statement matches the PDF behavior (one owner per statement).
  const [salesFilter, setSalesFilter] = React.useState<string>("");

  const [sheetTargets, setSheetTargets] = React.useState<SheetTargetsResponse | null>(null);
  const [sheetTargetsError, setSheetTargetsError] = React.useState<string | null>(null);

  const [sheetContracts, setSheetContracts] = React.useState<ContractsByOwnerResponse | null>(null);
  const [sheetContractsError, setSheetContractsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/sheet/targets?gid=641207863");
        if (!res.ok) throw new Error(`Failed to load targets: ${res.status}`);
        const data = (await res.json()) as SheetTargetsResponse;
        if (cancelled) return;
        setSheetTargets(data);
      } catch (e) {
        if (cancelled) return;
        setSheetTargetsError(e instanceof Error ? e.message : "Unknown error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/sheet/contracts?gid=1961903341");
        if (!res.ok) throw new Error(`Failed to load contracts: ${res.status}`);
        const data = (await res.json()) as ContractsByOwnerResponse;
        if (cancelled) return;
        setSheetContracts(data);
      } catch (e) {
        if (cancelled) return;
        setSheetContractsError(e instanceof Error ? e.message : "Unknown error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const people = React.useMemo(() => {
    if (!sheetTargets || !sheetContracts) return [];
    const names = sheetContracts.salesPeople.length > 0 ? sheetContracts.salesPeople : sheetTargets.dealOwners;
    const roles = [
      "Enterprise Account Exec",
      "Mid-Market Account Exec",
      "Strategic Accounts",
      "Partnerships",
      "Channel Sales",
      "New Business",
      "Expansion",
      "Renewals",
    ];

    const gen = (localRng: () => number, min: number, max: number) => Math.round(min + localRng() * (max - min));

    const quarterBonusDates = ["31/03/2026", "30/06/2026", "30/09/2026", "31/12/2026"];
    const quarterEndToQuarterId: Record<string, QuarterId> = {
      "31/03/2026": "2026Q1",
      "30/06/2026": "2026Q2",
      "30/09/2026": "2026Q3",
      "31/12/2026": "2026Q4",
    };

    const quarterIdToQuarterKey = (q: QuarterId) =>
      q === "2026Q1" ? "Q1" : q === "2026Q2" ? "Q2" : q === "2026Q3" ? "Q3" : "Q4";

    const quarterStartISO =
      quarter === "2026Q1" ? "2026-01-01" : quarter === "2026Q2" ? "2026-04-01" : quarter === "2026Q3" ? "2026-07-01" : "2026-10-01";

    const quarterEndISO =
      quarter === "2026Q1" ? "2026-03-31" : quarter === "2026Q2" ? "2026-06-30" : quarter === "2026Q3" ? "2026-09-30" : "2026-12-31";

    const isoToDDMMYYYY = (iso: string) => {
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };

    const monthsSinceAcquisitionFromDate = (contractDateISO: string) => {
      const [cy, cm, cd] = contractDateISO.split("-").map((x) => Number(x));
      const [qy, qm] = quarterStartISO.split("-").map((x) => Number(x));
      const monthDiff = (qy - cy) * 12 + (qm - cm);
      // Clamp so it doesn't explode the placeholder cash calc.
      return Math.max(0, Math.min(60, monthDiff + (cd ? 0 : 0)));
    };

    return names.map((name, idx) => {
      const personRng = mulberry32(hashString(`${quarter}:${name}`));

      const inYearRate = 0.03 + personRng() * 0.06; // 3%..9%
      const annualArrRate = 0.02 + personRng() * 0.05; // 2%..7%

      const contractsForOwner = sheetContracts.bySalesPerson[name] ?? [];
      const currentContracts = contractsForOwner.filter(
        (c) => c.contractDateISO >= quarterStartISO && c.contractDateISO <= quarterEndISO,
      );
      const priorContracts = contractsForOwner.filter((c) => c.contractDateISO < quarterStartISO);

      // ACV total (H + I)
      const currentPeriodBookings = currentContracts.reduce((acc, c) => acc + (c.acvTotal ?? 0), 0);
      const priorReportingPeriodBookings = priorContracts.reduce((acc, c) => acc + (c.acvTotal ?? 0), 0);
      const quarterlyInYearRevenueTarget =
        sheetTargets.inYearRevenueTargetsByOwner[name]?.[quarterIdToQuarterKey(quarter)] ??
        gen(personRng, 200_000, 900_000);
      const annualArrTarget =
        sheetTargets.arrTargetQ4ByOwner[name] ?? gen(personRng, 800_000, 2_000_000);

      // Simple placeholder policy logic:
      // - bookings components scale directly
      // - targets scale based on achieved ratio (bounded to [0..1.2])
      const inYearAchievedRatio =
        quarterlyInYearRevenueTarget > 0 ? Math.min(1.2, currentPeriodBookings / quarterlyInYearRevenueTarget) : 0;
      const annualAchievedRatio =
        annualArrTarget > 0
          ? Math.min(1.2, (currentPeriodBookings + priorReportingPeriodBookings) / annualArrTarget)
          : 0;

      const inYearTargetComponent = quarterlyInYearRevenueTarget * inYearRate * inYearAchievedRatio;
      const annualArrTargetComponent = annualArrTarget * annualArrRate * annualAchievedRatio;

      const fx = 0.75 + personRng() * 0.3; // placeholder

      const termToCommissionRatePct = (term: number) => {
        if (!Number.isFinite(term) || term < 2) return 0;
        if (term >= 36) return 10;
        if (term >= 24 && term <= 35) return 7.5;
        if (term >= 12 && term <= 23) return 5;
        if (term >= 2 && term <= 11) return 2.5;
        return 0;
      };

      const makeBookingLines = (contracts: ContractRow[]) => {
        const lines: BookingLine[] = [];
        if (contracts.length === 0) return lines;

        for (let i = 0; i < contracts.length; i++) {
          const contract = contracts[i];
          const contractualId = contract.contractualId;
          const clientName = contract.clientLegalName;
          const bookingDate = isoToDDMMYYYY(contract.contractDateISO);
          const monthsSinceAcquisition = monthsSinceAcquisitionFromDate(contract.contractDateISO);
          const contractCurrency = contract.contractCurrency || COMMISSION_CURRENCY;

          const acvTotal = Number.isFinite(contract.acvTotal) ? contract.acvTotal : 0;
          const acvCCY = Math.round(acvTotal);
          const acvLCY = Math.round(acvTotal); // placeholder assumes CCY == LCY

          const volumeDrivenPct = Math.floor(personRng() * 60 + 20); // 20..80
          const revenueDrivenPct = Math.max(0, 100 - volumeDrivenPct);

          // Commission rate is determined by "term" (G column).
          const commissionRatePct = termToCommissionRatePct(contract.term);
          const commissionRateVolumeDrivenPct = commissionRatePct * (volumeDrivenPct / 100);
          const commissionRateRevenueDrivenPct = commissionRatePct - commissionRateVolumeDrivenPct;

          const commissionPayableLCYVolumeDriven = acvLCY * (commissionRateVolumeDrivenPct / 100);
          const commissionPayableLCYRevenueDriven = acvLCY * (commissionRateRevenueDrivenPct / 100);
          const commissionPayableLCY = Math.round(commissionPayableLCYVolumeDriven + commissionPayableLCYRevenueDriven);

          const cashSinceContractEntryLCY = Math.round(
            acvLCY * (0.2 + monthsSinceAcquisition / 120) * (0.6 + personRng() * 0.7),
          );

          // For one deterministic booking line per table: mark ACV as fully paid-to-date.
          // Used for the "green" visual cue.
          const fullyPaidACV = i === 0;

          const commissionPayableToDateLCY = fullyPaidACV
            ? commissionPayableLCY
            : Math.round(commissionPayableLCY * (0.35 + personRng() * 0.2));
          const commissionToBePaidLCY = fullyPaidACV ? 0 : Math.max(0, commissionPayableLCY - commissionPayableToDateLCY);

          const commissionPayableToDateLCYVolumeDriven = fullyPaidACV
            ? Math.round(commissionPayableLCYVolumeDriven)
            : Math.round(commissionPayableLCYVolumeDriven * (0.35 + personRng() * 0.2));
          const commissionToBePaidLCYVolumeDriven = fullyPaidACV
            ? 0
            : Math.max(
                0,
                Math.round(commissionPayableLCYVolumeDriven - commissionPayableToDateLCYVolumeDriven),
              );

          const revenueThisPeriodLCY = acvLCY;

          const commissionPayableGBP = Math.round(commissionPayableLCY * fx);
          const commissionToBePaidThisQuarterGBP = fullyPaidACV ? 0 : commissionPayableGBP;

          lines.push({
            id: `${quarter}:${name}:curr:${i}`,
            contractualId,
            clientName,
            bookingDate,
            monthsSinceAcquisition,
            contractCurrency,
            acvCCY,
            acvLCY,
            volumeDrivenPct,
            revenueDrivenPct,
            commissionRatePct,
            commissionRateVolumeDrivenPct,
            commissionRateRevenueDrivenPct,
            commissionPayableLCY,
            commissionPayableLCYVolumeDriven: Math.round(commissionPayableLCYVolumeDriven),
            commissionPayableLCYRevenueDriven: Math.round(commissionPayableLCYRevenueDriven),
            cashSinceContractEntryLCY,
            commissionPayableToDateLCY,
            commissionToBePaidLCY,
            revenueThisPeriodLCY,
            commissionPayableToDateLCYVolumeDriven,
            commissionToBePaidLCYVolumeDriven,
            commissionPayableGBP,
            commissionToBePaidThisQuarterGBP,
            fxLCYtoGBP: Number(fx.toFixed(4)),
          });
        }

        return lines;
      };

      const currentBookingLines = makeBookingLines(currentContracts);
      const priorBookingLines = makeBookingLines(priorContracts);

      const currentComponent = currentBookingLines.reduce((acc, l) => acc + l.commissionToBePaidThisQuarterGBP, 0);
      const priorComponent = priorBookingLines.reduce((acc, l) => acc + l.commissionToBePaidThisQuarterGBP, 0);

      const totalCommission =
        currentComponent + priorComponent + inYearTargetComponent + annualArrTargetComponent;

      const quarterlyBonusRows: QuarterlyBonusRow[] = quarterBonusDates.map((d) => {
        const qForDate = quarterEndToQuarterId[d] ?? quarter;
        const qKey = quarterIdToQuarterKey(qForDate);
        const baseTarget = Math.round(sheetTargets.inYearRevenueTargetsByOwner[name]?.[qKey] ?? quarterlyInYearRevenueTarget);
        const variance = 0.7 + personRng() * 0.7; // 0.7..1.4
        const actual = Math.round(baseTarget * Math.min(1.2, inYearAchievedRatio) * variance);
        const targetMet = actual >= baseTarget;

        // Allocate commission by achieved ratio and whether target met.
        const ratio = Math.min(1.2, actual / Math.max(1, baseTarget));
        const commission = annualArrTargetComponentComponentHelper(inYearTargetComponent, ratio, targetMet);

        return {
          quarterEnd: d,
          targetUSD: baseTarget,
          actualUSD: actual,
          targetMet,
          commissionToBePaidThisQuarterGBP: Math.round(commission),
        };
      });

      const annualBonusRows: AnnualBonusRow[] = [
        (() => {
          const targetUSD = annualArrTarget;
          const actualUSD = Math.round(targetUSD * Math.min(1.2, annualAchievedRatio) * (0.75 + personRng() * 0.5));
          const targetMet = actualUSD >= targetUSD;
          const ratio = Math.min(1.2, actualUSD / Math.max(1, targetUSD));
          const commission = targetMet ? ratio * annualArrTargetComponent : 0;
          return {
            annualARRTargetUSD: annualArrTarget,
            quarterEnd: "31/12/2026",
            targetUSD,
            actualUSD,
            targetMet,
            commissionToBePaidThisQuarterGBP: Math.round(commission),
          };
        })(),
      ];

      const row: PersonRow = {
        id: `${quarter}-${idx}-${name}`,
        name,
        role: roles[idx % roles.length],
        currentPeriodBookings,
        priorReportingPeriodBookings,
        quarterlyInYearRevenueTarget,
        annualArrTarget,
        computed: {
          currentComponent,
          priorComponent,
          inYearTargetComponent,
          annualArrTargetComponent,
          totalCommission,
        },
        currentBookingLines,
        priorBookingLines,
        quarterlyBonusRows,
        annualBonusRows,
      };

      return row;
    });
  }, [quarter, sheetTargets, sheetContracts]);

  const filteredPeople = React.useMemo(() => {
    if (salesFilter === "ALL" || salesFilter === "") return people;
    return people.filter((p) => p.id === salesFilter);
  }, [people, salesFilter]);

  const activeQuarterEnd =
    quarter === "2026Q1"
      ? "31/03/2026"
      : quarter === "2026Q2"
        ? "30/06/2026"
        : quarter === "2026Q3"
          ? "30/09/2026"
          : "31/12/2026";
  const isAnnualActive = quarter === "2026Q4";

  const totals = React.useMemo(() => {
    const sum = (fn: (p: PersonRow) => number) => filteredPeople.reduce((acc, p) => acc + fn(p), 0);

    const currentComponent = sum((p) => p.computed.currentComponent);
    const priorComponent = sum((p) => p.computed.priorComponent);
    // "Bookings" in the summary are based on ACV (H + I), not the commission component.
    const currentBookingsACV = sum((p) => p.currentPeriodBookings);
    const priorBookingsACV = sum((p) => p.priorReportingPeriodBookings);

    const inYearTargetComponent = filteredPeople.reduce((acc, p) => {
      const activeRow = p.quarterlyBonusRows.find((r) => r.quarterEnd === activeQuarterEnd);
      return acc + (activeRow?.commissionToBePaidThisQuarterGBP ?? 0);
    }, 0);

    const annualArrTargetComponent = isAnnualActive
      ? filteredPeople.reduce((acc, p) => {
          const activeRow = p.annualBonusRows.find((r) => r.quarterEnd === "31/12/2026");
          return acc + (activeRow?.commissionToBePaidThisQuarterGBP ?? 0);
        }, 0)
      : 0;

    const totalCommission = currentComponent + priorComponent + inYearTargetComponent + annualArrTargetComponent;

    return {
      currentComponent,
      priorComponent,
      currentBookingsACV,
      priorBookingsACV,
      inYearTargetComponent,
      annualArrTargetComponent,
      totalCommission,
    };
  }, [filteredPeople, activeQuarterEnd, isAnnualActive]);

  React.useEffect(() => {
    if (salesFilter) return;
    if (people.length > 0) setSalesFilter(people[0].id);
  }, [people, salesFilter]);

  const exportToExcel = () => {
    try {
      if (!sheetTargets || people.length === 0) return;

      const csvEscape = (value: unknown) => {
        const s = value === null || value === undefined ? "" : String(value);
        return `"${s.replace(/"/g, '""')}"`;
      };

      const makeRow = (cells: unknown[]) => cells.map(csvEscape).join(",");

      const currentLines = activePerson
        ? activePerson.currentBookingLines
        : people.flatMap((p) => p.currentBookingLines);
      const priorLines = activePerson
        ? activePerson.priorBookingLines
        : people.flatMap((p) => p.priorBookingLines);
      const quarterlyRows = activePerson ? activePerson.quarterlyBonusRows : aggregateQuarterlyBonus(people);
      const annualRows = activePerson ? activePerson.annualBonusRows : aggregateAnnualBonus(people);

      const canShowQuarterlyNumber = (quarterEnd: string) => quarterEnd === activeQuarterEnd;
      const isAnnualShown = isAnnualActive;

      const currentTotalGBP = currentLines.reduce((a, b) => a + b.commissionToBePaidThisQuarterGBP, 0);
      const priorTotalGBP = priorLines.reduce((a, b) => a + b.commissionToBePaidThisQuarterGBP, 0);

      const activeSalesPersonName = activePerson?.name ?? "ALL";
      const safeQuarter = quarter.replace(/[^A-Za-z0-9_-]/g, "_");
      const safePerson = activeSalesPersonName.replace(/[^A-Za-z0-9_-]/g, "_");
      const fileName = `partner_management_bonus_statement_${safeQuarter}_${safePerson}.csv`;

      const sections: string[] = [];
      sections.push(makeRow(["Quarter", quarter]));
      sections.push(makeRow(["Partner Manager", activeSalesPersonName]));
      sections.push(makeRow(["Commission currency", COMMISSION_CURRENCY]));
      sections.push("");

      sections.push("Current reporting period bookings");
      sections.push(
        makeRow([
          "Contractual UUID",
          "Client Legal Name",
          "Contract currency",
          "ACV (CCY)",
          "Comm. rate (%)",
          "Comm. payable potential (CCY)",
          "Cash since contract entry (CCY)",
          "Comm. paid-to-date (CCY)",
          "Comm. to-be-paid (CCY)",
          "Comm. rate (volume-driven) (%)",
          "Revenue this period (CCY)",
          "Comm. paid-to-date (volume-driven) (CCY)",
          "Comm. to-be-paid (volume-driven) (CCY)",
          "Comm. to be paid this quarter (GBP)",
        ]),
      );
      for (const l of currentLines) {
        sections.push(
          makeRow([
            l.contractualId,
            l.clientName,
            l.contractCurrency,
            l.acvCCY,
            l.commissionRatePct,
            l.commissionPayableLCY,
            l.cashSinceContractEntryLCY,
            l.commissionPayableToDateLCY,
            l.commissionToBePaidLCY,
            l.commissionRateVolumeDrivenPct,
            l.revenueThisPeriodLCY,
            l.commissionPayableToDateLCYVolumeDriven,
            l.commissionToBePaidLCYVolumeDriven,
            l.commissionToBePaidThisQuarterGBP,
          ]),
        );
      }
      sections.push(makeRow(["TOTAL (GBP)", currentTotalGBP]));
      sections.push("");

      sections.push("Prior reporting period bookings");
      sections.push(
        makeRow([
          "Contractual UUID",
          "Client Legal Name",
          "Contract currency",
          "ACV (CCY)",
          "Comm. rate (%)",
          "Comm. payable potential (CCY)",
          "Cash since contract entry (CCY)",
          "Comm. paid-to-date (CCY)",
          "Comm. to-be-paid (CCY)",
          "Comm. rate (volume-driven) (%)",
          "Revenue this period (CCY)",
          "Comm. paid-to-date (volume-driven) (CCY)",
          "Comm. to-be-paid (volume-driven) (CCY)",
          "Comm. to be paid this quarter (GBP)",
        ]),
      );
      for (const l of priorLines) {
        sections.push(
          makeRow([
            l.contractualId,
            l.clientName,
            l.contractCurrency,
            l.acvCCY,
            l.commissionRatePct,
            l.commissionPayableLCY,
            l.cashSinceContractEntryLCY,
            l.commissionPayableToDateLCY,
            l.commissionToBePaidLCY,
            l.commissionRateVolumeDrivenPct,
            l.revenueThisPeriodLCY,
            l.commissionPayableToDateLCYVolumeDriven,
            l.commissionToBePaidLCYVolumeDriven,
            l.commissionToBePaidThisQuarterGBP,
          ]),
        );
      }
      sections.push(makeRow(["TOTAL (GBP)", priorTotalGBP]));
      sections.push("");

      sections.push("Quarterly in-year revenue target bonus");
      sections.push(
        makeRow([
          "Quarter-end",
          "Target (USD)",
          "Actuals (USD)",
          "Target met? (yes/no)",
          "Commission to be paid this quarter (GBP)",
        ]),
      );
      for (const r of quarterlyRows) {
        const isActiveQuarterRow = canShowQuarterlyNumber(r.quarterEnd);
        sections.push(
          makeRow([
            r.quarterEnd,
            isActiveQuarterRow ? r.targetUSD : "—",
            isActiveQuarterRow ? r.actualUSD : "—",
            isActiveQuarterRow ? (r.targetMet ? "yes" : "no") : "—",
            isActiveQuarterRow ? r.commissionToBePaidThisQuarterGBP : "—",
          ]),
        );
      }
      sections.push("");

      sections.push("Annual ARR target bonus");
      sections.push(
        makeRow([
          "Annual ARR Target (USD)",
          "Quarter-end",
          "Target (USD)",
          "Actuals (USD)",
          "Target met? (yes/no)",
          "Commission to be paid this quarter (GBP)",
        ]),
      );
      for (const r of annualRows) {
        sections.push(
          makeRow([
            isAnnualShown ? r.annualARRTargetUSD : "—",
            r.quarterEnd,
            isAnnualShown ? r.targetUSD : "—",
            isAnnualShown ? r.actualUSD : "—",
            isAnnualShown ? (r.targetMet ? "yes" : "no") : "—",
            isAnnualShown ? r.commissionToBePaidThisQuarterGBP : "—",
          ]),
        );
      }

      const csv = sections.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);

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

  const periodLabel = React.useMemo(() => {
    const map: Record<QuarterId, { start: string; end: string; label: string }> = {
      "2026Q1": { start: "01/01/2026", end: "31/03/2026", label: "Jan–Mar 2026" },
      "2026Q2": { start: "01/04/2026", end: "30/06/2026", label: "Apr–Jun 2026" },
      "2026Q3": { start: "01/07/2026", end: "30/09/2026", label: "Jul–Sep 2026" },
      "2026Q4": { start: "01/10/2026", end: "31/12/2026", label: "Oct–Dec 2026" },
    };
    return map[quarter];
  }, [quarter]);

  const activePerson = React.useMemo(() => {
    if (salesFilter === "ALL" || !salesFilter) return null;
    return people.find((p) => p.id === salesFilter) ?? null;
  }, [people, salesFilter]);

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
            {!sheetTargets || !sheetContracts ? "Loading commission inputs…" : periodLabel.label}
          </div>
          {sheetTargetsError ? <div className="mt-1 text-sm text-red-600">{sheetTargetsError}</div> : null}
          {sheetContractsError ? <div className="mt-1 text-sm text-red-600">{sheetContractsError}</div> : null}

          <div className="mt-4 flex items-center gap-3">
            <label htmlFor="salesFilter" className="text-sm font-semibold text-slate-700">
              Partner Manager
            </label>
            <select
              id="salesFilter"
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              className="h-10 min-w-[260px] rounded-xl border border-slate-200 bg-white/70 px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none ring-0 transition hover:bg-white"
            >
              <option value="ALL">All</option>
              {salesFilter === "" ? <option value="" disabled /> : null}
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
              // Ensure cleanup after printing.
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
            disabled={!sheetTargets || people.length === 0}
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
        {/* Top header like the PDF */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <div className="text-sm font-extrabold tracking-wide text-slate-900">
              QUARTERLY PARTNER MANAGEMENT BONUS STATEMENT
            </div>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              BOOKINGS ORIGINATOR
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {activePerson?.name ?? "All sales people"}
            </div>
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
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Commission currency
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">{COMMISSION_CURRENCY}</div>
          </div>
        </div>

        {/* SUMMARY block */}
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">SUMMARY</div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <SummaryRow
                label="Current reporting period bookings"
                value={formatCurrency(totals.currentBookingsACV, COMMISSION_CURRENCY)}
                sectionId="current-bookings"
              />
              <SummaryRow
                label="Prior reporting period bookings"
                value={formatCurrency(totals.priorBookingsACV, COMMISSION_CURRENCY)}
                sectionId="prior-bookings"
              />
              <SummaryRow
                label="Quarterly in-year revenue target"
                value={totals.inYearTargetComponent === 0 ? "—" : formatCurrency(totals.inYearTargetComponent, COMMISSION_CURRENCY)}
                sectionId="quarterly-target"
              />
              <SummaryRow
                label="Annual ARR target"
                value={totals.annualArrTargetComponent === 0 ? "—" : formatCurrency(totals.annualArrTargetComponent, COMMISSION_CURRENCY)}
                sectionId="annual-arr-target"
              />
            </div>

            <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-bold text-slate-900">
              TOTAL&nbsp;
              <span className="font-extrabold">
                {formatCurrency(totals.totalCommission, COMMISSION_CURRENCY)}
              </span>
            </div>
          </div>
        </div>

        {/* DETAILS sections (the missing parts from the PDF screenshots) */}
        {showAllSections && (
          <>
            <Section
              id="current-bookings"
              title="CURRENT REPORTING PERIOD BOOKINGS"
            >
              <BookingsTable lines={activePerson ? activePerson.currentBookingLines : people.flatMap((p) => p.currentBookingLines)} currency={COMMISSION_CURRENCY} />
            </Section>

            <Section id="prior-bookings" title="PRIOR REPORTING PERIOD BOOKINGS">
              <BookingsTable lines={activePerson ? activePerson.priorBookingLines : people.flatMap((p) => p.priorBookingLines)} currency={COMMISSION_CURRENCY} />
            </Section>

            <Section
              id="quarterly-target"
              title="QUARTERLY IN-YEAR REVENUE TARGET BONUS"
            >
              <QuarterlyBonusTable
                rows={activePerson ? activePerson.quarterlyBonusRows : aggregateQuarterlyBonus(people)}
                currency={COMMISSION_CURRENCY}
                activeQuarterEnd={activeQuarterEnd}
              />
            </Section>

            <Section id="annual-arr-target" title="ANNUAL ARR TARGET BONUS">
              <AnnualBonusTable
                rows={activePerson ? activePerson.annualBonusRows : aggregateAnnualBonus(people)}
                currency={COMMISSION_CURRENCY}
                isActive={isAnnualActive}
              />
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
      <div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-slate-600">
        {title}
      </div>
      {children}
    </div>
  );
}

function BookingsTable({ lines }: { lines: BookingLine[]; currency: string }) {
  const total = lines.reduce((a, b) => a + b.commissionToBePaidThisQuarterGBP, 0);
  const formatRatePct = (n: number) => {
    const rounded = Math.round(n);
    return Math.abs(n - rounded) < 1e-9 ? rounded.toFixed(0) : n.toFixed(1);
  };

  return (
    <div className="w-[calc(100%+16px)] -ml-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse table-fixed text-[10px]">
        <thead>
          {/* Group row (for visual separation like the template) */}
          <tr className="bg-transparent text-left text-[10px] text-slate-600">
            <th
              colSpan={3}
              className="border-b border-slate-300 bg-slate-100 px-1 py-2 text-center font-semibold"
            >
              Booking details
            </th>
            <th
              colSpan={6}
              className="border-b border-slate-300 border-l border-sky-200 bg-sky-50 px-1 py-2 text-center font-semibold"
            >
              ACV
            </th>
            <th
              colSpan={4}
              className="border-b border-slate-300 border-l border-cyan-200 bg-cyan-50 px-1 py-2 text-center font-semibold"
            >
              Volume-driven
            </th>
            <th
              colSpan={1}
              className="border-b border-slate-300 border-l border-emerald-200 bg-emerald-50 px-1 py-2 text-center font-semibold"
            >
              Payout &amp; FX
            </th>
          </tr>

          {/* Column header row 1/2: names (units in the next row) */}
          <tr className="bg-slate-50 text-left text-[10px] text-slate-600">
            <th className="px-1 py-1 text-left font-semibold">Contractual UUID</th>
            <th className="px-1 py-1 text-left font-semibold">Client Legal Name</th>
            <th className="px-1 py-1 text-center font-semibold border-r border-slate-300">Contract currency</th>

            <th className="px-1 py-1 text-center font-semibold">ACV</th>
            <th className="px-1 py-1 text-center font-semibold">Comm. rate</th>
            <th className="px-1 py-1 text-center font-semibold">Comm. payable potential</th>
            <th className="px-1 py-1 text-center font-semibold">Cash since contract entry</th>
            <th className="px-1 py-1 text-center font-semibold">Comm. paid-to-date</th>
            <th className="px-1 py-1 text-center font-semibold border-r border-slate-300">Comm. to-be-paid</th>

            <th className="px-1 py-1 text-center font-semibold border-l border-cyan-200">Comm. rate</th>
            <th className="px-1 py-1 text-center font-semibold">Revenue this period</th>
            <th className="px-1 py-1 text-center font-semibold">Comm. paid-to-date</th>
            <th className="px-1 py-1 text-center font-semibold border-r border-slate-300">Comm. to-be-paid</th>

            <th className="px-1 py-1 text-center font-semibold border-l border-emerald-200">
              Comm. to be paid this quarter
            </th>
          </tr>

          {/* Column header row 2/2: units */}
          <tr className="bg-slate-50 text-left text-[10px] text-slate-600">
            <th className="px-1 py-1 text-left text-[8px] font-normal italic"> </th>
            <th className="px-1 py-1 text-left text-[8px] font-normal italic"> </th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic border-r border-slate-300">CCY</th>

            <th className="px-1 py-1 text-center text-[8px] font-normal italic">CCY</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic">%</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic">LCY</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic">LCY</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic">LCY</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic border-r border-slate-300">LCY</th>

            <th className="px-1 py-1 text-center text-[8px] font-normal italic border-l border-cyan-200">%</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic">LCY</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic">LCY</th>
            <th className="px-1 py-1 text-center text-[8px] font-normal italic border-r border-slate-300">LCY</th>

            <th className="px-1 py-1 text-center text-[8px] font-normal italic border-l border-emerald-200">GBP</th>
          </tr>
        </thead>

        <tbody>
          {lines.map((l) => {
            const fullyPaidACVRow =
              l.commissionToBePaidLCY === 0 && l.commissionPayableToDateLCY === l.commissionPayableLCY;

            return (
            <tr
              key={l.id}
              className="border-t border-slate-200 text-[10px] text-slate-700 hover:bg-slate-50"
            >
              <td className="px-1 py-2 text-left text-slate-800">{l.contractualId}</td>
              <td className="px-1 py-2 text-left">{l.clientName}</td>
              <td className="px-1 py-2 tabular-nums text-center border-r border-slate-300">{l.contractCurrency}</td>

              <td
                className={`px-1 py-2 tabular-nums text-center border-l border-sky-200 ${
                  fullyPaidACVRow ? "bg-emerald-50 text-emerald-900" : ""
                }`}
              >
                {formatCurrency(l.acvCCY, l.contractCurrency)}
              </td>
              <td className={`px-1 py-2 tabular-nums text-center ${fullyPaidACVRow ? "bg-emerald-50 text-emerald-900" : ""}`}>
                {formatRatePct(l.commissionRatePct)}%
              </td>
              <td className={`px-1 py-2 tabular-nums text-center ${fullyPaidACVRow ? "bg-emerald-50 text-emerald-900" : ""}`}>
                {formatCurrency(l.commissionPayableLCY, l.contractCurrency)}
              </td>
              <td className={`px-1 py-2 tabular-nums text-center ${fullyPaidACVRow ? "bg-emerald-50 text-emerald-900" : ""}`}>
                {formatCurrency(l.cashSinceContractEntryLCY, l.contractCurrency)}
              </td>
              <td className={`px-1 py-2 tabular-nums text-center ${fullyPaidACVRow ? "bg-emerald-50 text-emerald-900" : ""}`}>
                {formatCurrency(l.commissionPayableToDateLCY, l.contractCurrency)}
              </td>
              <td
                className={`px-1 py-2 tabular-nums text-center border-r border-slate-300 ${
                  fullyPaidACVRow ? "bg-emerald-50 text-emerald-900" : ""
                }`}
              >
                {formatCurrency(l.commissionToBePaidLCY, l.contractCurrency)}
              </td>

              <td className="px-1 py-2 tabular-nums text-center border-l border-cyan-200">{l.commissionRateVolumeDrivenPct.toFixed(1)}%</td>
              <td className="px-1 py-2 tabular-nums text-center">{formatCurrency(l.revenueThisPeriodLCY, l.contractCurrency)}</td>
              <td className="px-1 py-2 tabular-nums text-center">{formatCurrency(l.commissionPayableToDateLCYVolumeDriven, l.contractCurrency)}</td>
              <td className="px-1 py-2 tabular-nums text-center border-r border-slate-300">{formatCurrency(l.commissionToBePaidLCYVolumeDriven, l.contractCurrency)}</td>

              <td className="px-1 py-2 tabular-nums text-center border-l border-emerald-200 font-bold text-slate-900">
                {formatCurrency(l.commissionToBePaidThisQuarterGBP, "GBP")}
              </td>
            </tr>
            );
          })}

          <tr className="border-t border-slate-300 bg-slate-50 text-[11px]">
            <td className="px-1 py-2 font-bold text-left" colSpan={13}>
              TOTAL
            </td>
            <td className="px-1 py-2 font-bold tabular-nums text-center text-slate-900">{formatCurrency(total, "GBP")}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function QuarterlyBonusTable({
  rows,
  currency,
  activeQuarterEnd,
}: {
  rows: QuarterlyBonusRow[];
  currency: string;
  activeQuarterEnd: string;
}) {
  const activeRows = rows.filter((r) => r.quarterEnd === activeQuarterEnd);
  const total = activeRows.reduce((a, b) => a + b.commissionToBePaidThisQuarterGBP, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[680px] border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] text-slate-600">
            <th className="w-[220px] px-3 py-2 font-semibold">Quarter-end on (DD/MM/YYYY)</th>
            <th className="w-[120px] px-3 py-2 font-semibold">Target (USD)</th>
            <th className="w-[120px] px-3 py-2 font-semibold">Actuals (USD)</th>
            <th className="w-[120px] px-3 py-2 font-semibold">Target met? (yes/no)</th>
            <th className="w-[200px] px-3 py-2 font-semibold">Commission to be paid this quarter (GBP)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.quarterEnd}
              className="border-t border-slate-200 text-[11px] text-slate-700"
            >
              {(() => {
                const isActive = r.quarterEnd === activeQuarterEnd;
                const muted = !isActive;
                return (
                  <>
                    <td className={`px-3 py-2 font-semibold ${muted ? "text-slate-300" : "text-slate-900"}`}>
                      {r.quarterEnd}
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${muted ? "text-slate-300" : ""}`}>
                      {muted ? "—" : formatCurrency(r.targetUSD, "USD")}
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${muted ? "text-slate-300" : ""}`}>
                      {muted ? "—" : formatCurrency(r.actualUSD, "USD")}
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${muted ? "text-slate-300" : ""}`}>
                      {muted ? "—" : r.targetMet ? "yes" : "no"}
                    </td>
                    <td className={`px-3 py-2 tabular-nums font-bold ${muted ? "text-slate-300" : "text-slate-900"}`}>
                      {muted ? "—" : formatCurrency(r.commissionToBePaidThisQuarterGBP, currency)}
                    </td>
                  </>
                );
              })()}
            </tr>
          ))}
          <tr className="border-t border-slate-300 bg-slate-50">
            <td className="px-3 py-2 font-bold" colSpan={4}>
              TOTAL
            </td>
            <td className="px-3 py-2 font-bold tabular-nums text-slate-900">{formatCurrency(total, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AnnualBonusTable({
  rows,
  currency,
  isActive,
}: {
  rows: AnnualBonusRow[];
  currency: string;
  isActive: boolean;
}) {
  const total = isActive
    ? rows.reduce((a, b) => a + b.commissionToBePaidThisQuarterGBP, 0)
    : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[680px] border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] text-slate-600">
            <th className="w-[160px] px-3 py-2 font-semibold">Annual ARR Target (USD)</th>
            <th className="w-[220px] px-3 py-2 font-semibold">Target (USD)</th>
            <th className="w-[120px] px-3 py-2 font-semibold">Actuals (USD)</th>
            <th className="w-[120px] px-3 py-2 font-semibold">Target met? (yes/no)</th>
            <th className="w-[200px] px-3 py-2 font-semibold">Commission to be paid this quarter (GBP)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.quarterEnd} className="border-t border-slate-200 text-[11px] text-slate-700">
              <td
                className={`px-3 py-2 tabular-nums font-semibold ${isActive ? "text-slate-900" : "text-slate-300"}`}
              >
                {isActive ? formatCurrency(r.annualARRTargetUSD, "USD") : "—"}
              </td>
              <td className={`px-3 py-2 tabular-nums ${isActive ? "" : "text-slate-300"}`}>
                {isActive ? formatCurrency(r.targetUSD, "USD") : "—"}
              </td>
              <td className={`px-3 py-2 tabular-nums ${isActive ? "" : "text-slate-300"}`}>
                {isActive ? formatCurrency(r.actualUSD, "USD") : "—"}
              </td>
              <td className={`px-3 py-2 tabular-nums ${isActive ? "" : "text-slate-300"}`}>
                {isActive ? (r.targetMet ? "yes" : "no") : "—"}
              </td>
              <td
                className={`px-3 py-2 tabular-nums font-bold ${isActive ? "text-slate-900" : "text-slate-300"}`}
              >
                {isActive ? formatCurrency(r.commissionToBePaidThisQuarterGBP, currency) : "—"}
              </td>
            </tr>
          ))}
          <tr className="border-t border-slate-300 bg-slate-50">
            <td className="px-3 py-2 font-bold" colSpan={4}>
              TOTAL
            </td>
            <td className="px-3 py-2 font-bold tabular-nums text-slate-900">
              {isActive ? formatCurrency(total, currency) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function aggregateQuarterlyBonus(people: PersonRow[]): QuarterlyBonusRow[] {
  // Placeholder aggregation for "All" filter.
  if (people.length === 0) return [];
  const dates = people[0].quarterlyBonusRows.map((r) => r.quarterEnd);
  return dates.map((d) => {
    const rowForDate = people
      .flatMap((p) => p.quarterlyBonusRows)
      .filter((r) => r.quarterEnd === d);
    return {
      quarterEnd: d,
      targetUSD: rowForDate.reduce((a, b) => a + b.targetUSD, 0),
      actualUSD: rowForDate.reduce((a, b) => a + b.actualUSD, 0),
      targetMet: rowForDate.every((r) => r.targetMet),
      commissionToBePaidThisQuarterGBP: rowForDate.reduce((a, b) => a + b.commissionToBePaidThisQuarterGBP, 0),
    };
  });
}

function aggregateAnnualBonus(people: PersonRow[]): AnnualBonusRow[] {
  if (people.length === 0) return [];
  return [
    {
      annualARRTargetUSD: people.reduce((a, p) => a + p.annualArrTarget, 0),
      quarterEnd: "31/12/2026",
      targetUSD: people.reduce((a, p) => a + p.annualArrTarget, 0),
      actualUSD: people.reduce((a, p) => a + p.annualArrTarget, 0),
      targetMet: true,
      commissionToBePaidThisQuarterGBP: people.reduce((a, p) => a + p.computed.annualArrTargetComponent, 0),
    },
  ];
}

function annualArrTargetComponentComponentHelper(inYearTargetComponent: number, ratio: number, targetMet: boolean) {
  // Keep it simple but deterministic.
  if (!targetMet) return 0;
  return inYearTargetComponent * Math.min(1.2, ratio);
}

