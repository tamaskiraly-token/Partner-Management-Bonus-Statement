export function formatCurrency(n: number, currency: string = "GBP"): string {
  if (!Number.isFinite(n)) return "—";
  const ccy = currency?.trim().toUpperCase() || "GBP";
  try {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 0,
  }).format(n);
  } catch {
    // Fallback if currency code is invalid.
    return new Intl.NumberFormat("en-GB", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(n);
  }
}

