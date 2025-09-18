if (event.type === 'invoice.payment_succeeded') {
  const invoice = event.data.object as Stripe.Invoice;

  // Try to get the customer's email
  let email = invoice.customer_email || undefined;
  const customerId = invoice.customer as string | null;
  if (!email && customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (typeof customer === 'object' && customer && 'email' in customer) {
      email = (customer as Stripe.Customer).email || undefined;
    }
  }

  // Determine weekly vs monthly from the invoice's first line item
  const line = invoice.lines?.data?.[0];
  const interval = line?.price?.recurring?.interval; // 'week' | 'month'

  // Generate a demo 6-digit code and validity window
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const start = new Date(); start.setHours(15, 0, 0, 0); // 3pm check-in
  const end = new Date(start);
  end.setDate(end.getDate() + (interval === 'month' ? 30 : 7));
  end.setHours(11, 0, 0, 0); // 11am check-out

  console.log('✅ invoice.payment_succeeded');
  console.log('🔐 Test door code for', email || '(no email found):', code);
  console.log('   Valid', start.toISOString(), '→', end.toISOString());
  console.log('   Interval from Stripe:', interval);

  // ---- Send email via Postmark (simple JSON API) ----
  if (process.env.POSTMARK_TOKEN && process.env.SENDER_EMAIL && email) {
    const text = [
      `Hi,`,
      ``,
      `Thanks for your ${interval === 'month' ? 'monthly' : 'weekly'} payment at Relax Inn.`,
      `Your door code is: ${code}`,
      `Valid ${start.toLocaleString()} → ${end.toLocaleString()}.`,
      ``,
      `If you need help, call the front desk.`,
      `— Relax Inn Hartford City`
    ].join('\n');

    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN as string,
      },
      body: JSON.stringify({
        From: process.env.SENDER_EMAIL,
        To: email,
        Subject: 'Your Relax Inn door code',
        TextBody: text,
      }),
    });

    const body = await res.text();
    console.log('📧 Postmark response:', res.status, body);
  } else {
    console.log('📧 Skipped email (missing POSTMARK_TOKEN/SENDER_EMAIL or customer email).');
  }
}
