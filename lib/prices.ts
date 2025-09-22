// lib/prices.ts
export function getPriceIds() {
  const weekly = process.env.STRIPE_PRICE_WEEKLY;
  const monthly = process.env.STRIPE_PRICE_MONTHLY;
  const movein = process.env.STRIPE_PRICE_MOVEIN;

  const missing: string[] = [];
  if (!weekly) missing.push("STRIPE_PRICE_WEEKLY");
  if (!monthly) missing.push("STRIPE_PRICE_MONTHLY");
  if (!movein) missing.push("STRIPE_PRICE_MOVEIN");

  return { weekly, monthly, movein, missing };
}
