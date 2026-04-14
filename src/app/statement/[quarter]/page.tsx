import { QUARTERS, type QuarterId } from "@/lib/quarters";
import { PartnerManagementBonusStatementTemplate } from "@/components/statement/PartnerManagementBonusStatementTemplate";

export default async function StatementQuarterPage({
  params,
}: {
  params: Promise<{ quarter: string }>;
}) {
  const { quarter: quarterParam } = await params;
  const quarter = quarterParam as QuarterId;

  if (!QUARTERS.includes(quarter)) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold text-slate-900">
          Unknown quarter
        </div>
        <div className="mt-1 text-sm text-slate-600">
          Valid quarters: {QUARTERS.join(", ")}
        </div>
      </div>
    );
  }

  return <PartnerManagementBonusStatementTemplate quarter={quarter} />;
}

