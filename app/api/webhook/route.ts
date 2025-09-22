// app/api/webhook/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getPriceIds } from "../../../lib/prices";

export const runtime = "nodejs";

// IMPORTANT: add STRIPE_WEBHOOK_SECRET in Vercel for Production/Preview
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing webhook signature/secret" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "payment") break;

        // From checkout metadata
        const plan = (session.metadata?.plan as "weekly" | "monthly") || "weekly";
        const hadMoveIn = session.metadata?.had_movein === "1";

        // Load the PaymentIntent to get the payment method + customer
        if (!session.payment_intent) break;
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
          expand: ["payment_method", "customer"],
        });

        const customerId =
          (typeof session.customer === "string" && session.customer) ||
          (typeof pi.customer === "string" && pi.customer) ||
          null;

        if (!customerId) {
          // Create or attach a customer if needed. We prefer using the one Checkout created.
          const created = await stripe.customers.create({
            email: session.customer_details?.email || undefined,
            name: session.customer_details?.name || undefined,
          });
          // (We won't bail, but it's unlikely we get here.)
          // Use created.id as fallback.
        }

        const pmId =
          (typeof pi.payment_method === "string" && pi.payment_method) ||
          (pi.payment_method && (pi.payment_method as any).id) ||
          null;

        // Determine next anchor (end of first period)
        const now = Math.floor(Date.now() / 1000);
        const seconds = plan === "weekly" ? 7 * 24 * 60 * 60 : 30 * 24 * 60 * 60;
        const anchor = now + seconds;

        // Choose recurring price
        const { weekly, monthly } = getPriceIds();
        const recurringPriceId = plan === "weekly" ? weekly : monthly;
        if (!recurringPriceId) {
          throw new Error("Missing recurring price env var on webhook.");
        }

        // Create / update customer default payment method if we have one
        const customerToUse = (customerId as string) || (session.customer as string);
        if (customerToUse && pmId) {
          await stripe.customers.update(customerToUse, {
            invoice_settings: { default_payment_method: pmId },
          });
        }

        // Create the subscription that starts charging at the next period boundary
        await stripe.subscriptions.create({
          customer: (customerId as string) || (session.customer as string),
          items: [{ price: recurringPriceId }],
          billing_cycle_anchor: anchor,
          proration_behavior: "none",
          collection_method: "charge_automatically",
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          // If you want to email upcoming invoices, enable "Send upcoming invoice emails"
          // in Stripe Dashboard. For custom 2-day reminders, see the invoice.upcoming case below.
          metadata: {
            source: "rihct4-webhook",
            plan,
            had_movein: hadMoveIn ? "1" : "0",
          },
        });

        break;
      }

      // Optional: We'll wire a hook for your "2-days-before" reminder window.
      case "invoice.upcoming": {
        const inv = event.data.object as Stripe.Invoice;
        // This event fires ~1 hour before the invoice is finalized for automatic collection,
        // which is usually ~1 day before depending on the schedule. If you need *exactly*
        // 2 days before, you can schedule a reminder by comparing inv.next_payment_attempt
        // (epoch seconds) to Date.now() and only email if ~48h out.
        // TODO: Call Postmark here to send a friendly reminder email.
        // Example (pseudo):
        // await sendReminderEmail(inv.customer_email, { ...details });
        break;
      }

      default:
        // no-op
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Webhook handler error" }, { status: 500 });
  }
}

// Tell Next.js to give us the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};
