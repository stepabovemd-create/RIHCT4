// app/api/invoices/schedule-next/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

/**
 * POST /api/invoices/schedule-next
 * Body: {
 *   email: string,
 *   amount_cents: number,   // e.g. 29900 for $299.00
 *   currency?: string,      // default 'usd'
 *   product_name?: string,  // e.g. "Weekly Rent"
 *   due_date_epoch: number  // UNIX seconds when payment is due
 * }
 *
 * Creates a DRAFT invoice with one line item, sets it to "send_invoice",
 * assigns the due date, then schedules auto-finalization 2 days beforehand.
 * When Stripe finalizes, it emails the invoice automatically (per your dashboard settings).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      amount_cents?: number;
      currency?: string;
      product_name?: string;
      due_date_epoch?: number;
    };

    const email = body.email?.trim();
    const amount = body.amount_cents;
    const currency = (body.currency || "usd").toLowerCase();
    const productName = body.product_name || "Rent";
    const dueDate = body.due_date_epoch;

    if (!email || !amount || !dueDate) {
      return NextResponse.json(
        { error: "Missing required fields: email, amount_cents, due_date_epoch" },
        { status: 400 }
      );
    }

    // 1) Find or create customer
    const found = await stripe.customers.search({
      query: `email:'${email.replace(/'/g, "\\'")}'`,
      limit: 1,
    });
    const customer =
      found.data[0] ||
      (await stripe.customers.create({
        email,
      }));

    // 2) Create an invoice item (adds a line to the next invoice)
    await stripe.invoiceItems.create({
      customer: customer.id,
      amount,
      currency,
      description: productName,
    });

    // 3) Create the DRAFT invoice (send_invoice = email customer, no auto-charge)
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      due_date: dueDate,
      auto_advance: true,
    });

    // 4) Schedule finalization 2 days (48h) before due date
    //    If the chosen time is already in the past (e.g. close to due), push it a few minutes from now.
    const twoDays = 2 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    const finalizeAt = Math.max(dueDate - twoDays, now + 300);

    // Some Stripe TypeScript versions don’t have schedule_settings in the types yet.
    // Use a narrow cast to avoid build failures while still sending correct params.
    await stripe.invoices.update(
      invoice.id,
      {
        schedule_settings: {
          scheduled_finalization: {
            enabled: true,
            finalize_at: finalizeAt,
          },
        },
      } as unknown as Stripe.InvoiceUpdateParams
    );

    return NextResponse.json({
      ok: true,
      invoice_id: invoice.id,
      finalize_at: finalizeAt,
      due_date: dueDate,
      customer_id: customer.id,
      email,
      amount_cents: amount,
      currency,
      product_name: productName,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "schedule error" },
      { status: 500 }
    );
  }
}
