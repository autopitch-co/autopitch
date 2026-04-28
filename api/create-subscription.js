import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const PLAN_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  unlimited: process.env.STRIPE_PRICE_UNLIMITED,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { paymentMethodId, email, firstName, lastName, plan } = req.body;
  if (!paymentMethodId || !email || !plan) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    let customer = existingCustomers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email, name: `${firstName} ${lastName}`.trim(),
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { plan, source: 'autopitch' }
      });
    } else {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
      await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethodId } });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PLAN_PRICE_IDS[plan] }],
      trial_period_days: 30,
      payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
      metadata: { plan, email }
    });

    await supabase.from('users').upsert({
      email, first_name: firstName, last_name: lastName, plan,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      trial_ends_at: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      status: 'trialing', applications_used: 0,
      created_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    await supabase.from('email_queue').insert([
      { email, first_name: firstName, plan, type: 'checkin', subject: "Have you sent your first batch yet?", send_at: new Date(Date.now()+7*24*60*60*1000).toISOString(), sent: false },
      { email, first_name: firstName, plan, type: 'reminder', subject: "5 days left on your Autopitch trial", send_at: new Date(Date.now()+25*24*60*60*1000).toISOString(), sent: false },
      { email, first_name: firstName, plan, type: 'charge', subject: "You'll be charged in 3 days", send_at: new Date(Date.now()+28*24*60*60*1000).toISOString(), sent: false },
    ]);

    await resend.emails.send({
      from: 'Autopitch <hello@autopitch.co>',
      to: email,
      subject: "⚡ Your Autopitch trial has started — here's your login",
      html: `<div style="background:#06060f;color:#ddd8cc;font-family:monospace;padding:40px;max-width:560px;margin:0 auto;">
        <div style="font-size:22px;font-weight:900;color:#f0c060;margin-bottom:24px;">Autopitch ⚡</div>
        <h1 style="font-size:26px;margin-bottom:16px;">You're in, ${firstName}. Your 30-day trial has started.</h1>
        <p style="color:#6b6b80;line-height:1.8;margin-bottom:24px;">Welcome to Autopitch. Your account is ready. Go to autopitch.co/dashboard to log in — no password needed, just use Google, Apple, or a magic link.</p>
        <a href="https://autopitch.co/dashboard" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#d4a843,#f0c060);border-radius:6px;color:#06060f;font-weight:700;text-decoration:none;margin-bottom:24px;">Go to My Dashboard →</a>
        <div style="background:#0a0a18;border:1px solid #1a1a2e;border-radius:8px;padding:16px;font-size:12px;color:#6b6b80;line-height:1.8;">
          Plan: ${plan} · Trial: 30 days · Card charged: After trial ends only · Cancel: Anytime
        </div>
        <p style="font-size:11px;color:#2a2a40;margin-top:32px;">Questions? Reply to this email. <a href="https://autopitch.co" style="color:#44445a;">autopitch.co</a></p>
      </div>`
    });

    return res.status(200).json({ success: true, subscriptionId: subscription.id });
  } catch (err) {
    console.error('Subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}
