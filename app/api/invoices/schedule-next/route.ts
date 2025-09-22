import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

/**
 * POST /api/invoices/schedule-next
 * Body: {
 *   email: string,
 *   amount_cents: number,   // rent for the next period in cents
 *   currency?: string,      // default 'usd'
 *   product_name?: string,  // e.g. "Weekly Rent" / "Monthly Rent"
 *   due_date_epoch: number, // when the invoice is due (guest's "checkout"/renew date)
 * }
 *
 * We will:
 *  - find/create customer
 *  - create a DRAFT invoice with an invoice item
 *  - set collection_method: 'send_invoice' (no auto-charge)
 *  - set due_date
 *  - schedule FINALIZATION at (due_date - 2 days)
 *  => Stripe emails the invoice automatically when it finalizes
 */
export async function POST(req: Request) {
  try {
    const { email, amount_cents, currency = "usd", product_name = "Rent", due_date_epoch } =
      (await req.json()) as {
        email?: string; amount_cents?: number; currency?: string; product_name?: string; due_date_epoch?: number;
      };

    if (!email || !amount_cents || !due_date_epoch) {
      return NextResponse.json({ error: "email, amount_cents, due_date_epoch required" }, { status: 400 });
    }

    // 1) Customer
    const found = await stripe.customers.search({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: 1 });
    const customer = found.data[0] || await stripe.customers.create({ email });

    // 2) Create an invoice item (line)
    await stripe.invoiceItems.create({
      customer: customer.id,
      amount: amount_cents,
      currency,
      description: product_name,
    });

    // 3) Create a DRAFT invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice", // email; customer pays themselves; no auto-charge
      due_date: due_date_epoch,          // when payment is due
      auto_advance: true,                // let Stripe advance statuses automatically
      // (optional) footer, metadata, account tax settings, etc.
    });

    // 4) Schedule finalization exactly 2 days before due date
    const twoDays = 2 * 24 * 60 * 60;
    const finalizeAt = Math.max(Math.floor(due_date_epoch - twoDays), Math.floor(Date.now() / 1000) + 300);

    await stripe.invoices.update(invoice.id, {
      schedule_settings: {
        scheduled_finalization: { enabled: true, finalize_at: finalizeAt },
      },
    });

    // NOTE: Stripe can also send automatic reminder emails for unpaid invoices (Dashboard setting).
    // See: Settings → Billing → Subscriptions and emails → Manage invoices sent to customers. :contentReference[oaicite:6]{index=6}

    return NextResponse.json({ ok: true, invoice_id: invoice.id, finalize_at: finalizeAt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "schedule error" }, { status: 500 });
  }
}
