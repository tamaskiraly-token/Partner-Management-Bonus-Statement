export const QUARTERS = ["2026Q1", "2026Q2", "2026Q3", "2026Q4"] as const;

export type QuarterId = (typeof QUARTERS)[number];

