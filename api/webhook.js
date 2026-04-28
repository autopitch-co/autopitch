import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const { type, data } = event;

  try {
    switch (type) {

      case 'customer.subscription.trial_will_end': {
        const sub = data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const { data: user } = await supabase.from('users').select('*').eq('stripe_customer_id', sub.customer).single();
        if (user) {
          await resend.emails.send({
            from: 'Autopitch <hello@autopitch.co>',
            to: customer.email,
            subject: 'Your Autopitch trial ends in 3 days',
            html: `<div style="background:#06060f;color:#ddd8cc;font-family:monospace;padding:40px;max-width:560px;margin:0 auto;">
              <div style="font-size:20px;font-weight:900;color:#f0c060;margin-bottom:24px;">Autopitch ⚡</div>
              <h1 style="font-size:24px;margin-bottom:16px;">Your trial ends in 3 days.</h1>
              <p style="color:#6b6b80;line-height:1.8;margin-bottom:20px;">Hey ${user.first_name} — your Autopitch trial ends soon. After that your ${user.plan} plan activates and your card on file will be charged.</p>
              <a href="https://autopitch.co/dashboard" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#d4a843,#f0c060);border-radius:6px;color:#06060f;font-weight:700;text-decoration:none;margin-bottom:20px;">Go to My Dashboard →</a>
              <p style="font-size:11px;color:#2a2a40;margin-top:24px;"><a href="https://autopitch.co/dashboard" style="color:#44445a;">Cancel anytime from your dashboard</a></p>
            </div>`
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = data.object;
        await supabase.from('users').update({ status: 'active' }).eq('stripe_customer_id', invoice.customer);
        if (invoice.billing_reason === 'subscription_cycle') {
          const customer = await stripe.customers.retrieve(invoice.customer);
          const { data: user } = await supabase.from('users').select('*').eq('stripe_customer_id', invoice.customer).single();
          if (user) {
            await resend.emails.send({
              from: 'Autopitch <hello@autopitch.co>',
              to: customer.email,
              subject: 'Payment confirmed — Autopitch',
              html: `<div style="background:#06060f;color:#ddd8cc;font-family:monospace;padding:40px;max-width:560px;margin:0 auto;">
                <div style="font-size:20px;font-weight:900;color:#f0c060;margin-bottom:24px;">Autopitch ⚡</div>
                <h1 style="font-size:24px;margin-bottom:16px;">Payment confirmed. Keep pitching.</h1>
                <p style="color:#6b6b80;line-height:1.8;margin-bottom:20px;">Hey ${user.first_name} — your ${user.plan} plan payment of $${(invoice.amount_paid/100).toFixed(2)} went through. You're all set for another month.</p>
                <a href="https://autopitch.co/dashboard" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#d4a843,#f0c060);border-radius:6px;color:#06060f;font-weight:700;text-decoration:none;">Go to Dashboard →</a>
              </div>`
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const { data: user } = await supabase.from('users').select('*').eq('stripe_customer_id', invoice.customer).single();
        await supabase.from('users').update({ status: 'past_due' }).eq('stripe_customer_id', invoice.customer);
        if (user) {
          await resend.emails.send({
            from: 'Autopitch <hello@autopitch.co>',
            to: customer.email,
            subject: 'Action needed — Autopitch payment failed',
            html: `<div style="background:#06060f;color:#ddd8cc;font-family:monospace;padding:40px;max-width:560px;margin:0 auto;">
              <div style="font-size:20px;font-weight:900;color:#f0c060;margin-bottom:24px;">Autopitch ⚡</div>
              <h1 style="font-size:24px;margin-bottom:16px;">We couldn't process your payment.</h1>
              <p style="color:#6b6b80;line-height:1.8;margin-bottom:20px;">Hey ${user.first_name} — your payment didn't go through. Update your card to keep your account active.</p>
              <a href="https://autopitch.co/dashboard" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#d4a843,#f0c060);border-radius:6px;color:#06060f;font-weight:700;text-decoration:none;">Update Payment Method →</a>
            </div>`
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        await supabase.from('users').update({ status: 'cancelled' }).eq('stripe_customer_id', sub.customer);
        await resend.emails.send({
          from: 'Autopitch <hello@autopitch.co>',
          to: customer.email,
          subject: 'Your Autopitch subscription has been cancelled',
          html: `<div style="background:#06060f;color:#ddd8cc;font-family:monospace;padding:40px;max-width:560px;margin:0 auto;">
            <div style="font-size:20px;font-weight:900;color:#f0c060;margin-bottom:24px;">Autopitch ⚡</div>
            <h1 style="font-size:24px;margin-bottom:16px;">Subscription cancelled.</h1>
            <p style="color:#6b6b80;line-height:1.8;margin-bottom:20px;">Your subscription has been cancelled. You won't be charged again. Your data is saved for 90 days — reactivate anytime.</p>
            <a href="https://autopitch.co/pricing.html" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#d4a843,#f0c060);border-radius:6px;color:#06060f;font-weight:700;text-decoration:none;">Reactivate My Account →</a>
          </div>`
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = data.object;
        await supabase.from('users').update({ plan: sub.metadata?.plan || 'pro' }).eq('stripe_subscription_id', sub.id);
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
}
