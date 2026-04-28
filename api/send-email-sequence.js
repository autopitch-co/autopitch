import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();
  const { data: emails, error } = await supabase
    .from('email_queue')
    .select('*')
    .eq('sent', false)
    .lte('send_at', now);

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0, failed = 0;

  for (const item of emails) {
    try {
      const html = getEmailHtml(item);
      if (!html) continue;
      await resend.emails.send({
        from: 'Autopitch <hello@autopitch.co>',
        to: item.email,
        subject: item.subject,
        html
      });
      await supabase.from('email_queue').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', item.id);
      sent++;
    } catch (err) {
      console.error(`Failed to send email ${item.id}:`, err);
      failed++;
    }
  }

  return res.status(200).json({ processed: emails.length, sent, failed });
}

function getEmailHtml(item) {
  const { type, first_name, plan } = item;
  const base = `background:#06060f;color:#ddd8cc;font-family:monospace;padding:40px;max-width:560px;margin:0 auto;`;
  const logo = `<div style="font-size:20px;font-weight:900;color:#f0c060;margin-bottom:24px;">Autopitch ⚡</div>`;
  const btn = (text, url) => `<a href="${url}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#d4a843,#f0c060);border-radius:6px;color:#06060f;font-weight:700;text-decoration:none;margin-bottom:20px;">${text}</a>`;
  const footer = `<p style="font-size:11px;color:#2a2a40;margin-top:24px;"><a href="https://autopitch.co/dashboard" style="color:#44445a;">Cancel anytime from your dashboard</a> · <a href="https://autopitch.co" style="color:#44445a;">autopitch.co</a></p>`;

  if (type === 'checkin') {
    return `<div style="${base}">${logo}
      <h1 style="font-size:24px;margin-bottom:16px;">Day 7. Have you sent your first batch yet?</h1>
      <p style="color:#6b6b80;line-height:1.8;margin-bottom:16px;">Hey ${first_name} — you're one week into your Autopitch trial. If you haven't run your first batch yet, here's how to get going in 5 minutes:</p>
      <div style="background:#0a0a18;border:1px solid #1a1a2e;border-radius:8px;padding:16px;font-size:12px;color:#6b6b80;line-height:1.9;margin-bottom:20px;">
        1. Go to My Resume and paste your master resume<br/>
        2. Run a search with your filters set<br/>
        3. Click Add All to Queue<br/>
        4. Hit Process All — go to sleep<br/>
        5. Wake up with tailored resumes + cold emails ready
      </div>
      ${btn('Go to My Dashboard →', 'https://autopitch.co/dashboard')}
      <div style="background:#0d1a0d;border:1px solid #2a4a2a;border-radius:6px;padding:14px;font-size:12px;color:#5aaa8a;line-height:1.7;">
        💡 Most users who see results in the first week run a batch of 20+ on their first night. Volume is the game.
      </div>
      ${footer}
    </div>`;
  }

  if (type === 'reminder') {
    const price = plan === 'pro' ? '$29' : plan === 'unlimited' ? '$59' : '$0';
    return `<div style="${base}">${logo}
      <h1 style="font-size:24px;margin-bottom:16px;">5 days left on your free trial.</h1>
      <p style="color:#6b6b80;line-height:1.8;margin-bottom:16px;">Hey ${first_name} — your Autopitch trial ends in 5 days. After that your ${plan} plan activates at ${price}/month.</p>
      <p style="color:#6b6b80;line-height:1.8;margin-bottom:20px;">That's less than a dollar a day for a tool that sends hundreds of tailored applications while you sleep.</p>
      ${btn('Make the Most of Your Trial →', 'https://autopitch.co/dashboard')}
      ${footer}
    </div>`;
  }

  if (type === 'charge') {
    const price = plan === 'pro' ? '$29' : plan === 'unlimited' ? '$59' : '$0';
    return `<div style="${base}">${logo}
      <h1 style="font-size:24px;margin-bottom:16px;">You'll be charged ${price} in 3 days.</h1>
      <p style="color:#6b6b80;line-height:1.8;margin-bottom:16px;">Hey ${first_name} — transparent heads up. Your trial ends in 3 days and your card will be charged ${price} for your first month of ${plan}.</p>
      <p style="color:#6b6b80;line-height:1.8;margin-bottom:20px;">Nothing you need to do — it's automatic. If you'd like to cancel, do that below before the charge processes.</p>
      ${btn('Go to My Dashboard →', 'https://autopitch.co/dashboard')}
      ${footer}
    </div>`;
  }

  return null;
}
