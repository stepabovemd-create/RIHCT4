// app/api/health/prices/route.ts
import { NextResponse } from "next/server";
import { getPriceIds } from "@/lib/prices";

export const runtime = "nodejs";

export async function GET() {
  const { weekly, monthly, movein, missing } = getPriceIds();
  return NextResponse.json({
    env: process.env.VERCEL_ENV, // "production" | "preview" | "development"
    has: {
      weekly: Boolean(weekly),
      monthly: Boolean(monthly),
      movein: Boolean(movein),
    },
    missing,
  });
}
