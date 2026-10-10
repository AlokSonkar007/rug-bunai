// ═══════════════════════════════════════════════════════════════════════════
// order-notifications — Supabase Edge Function (notification outbox worker)
//
// Deploy:   supabase functions deploy orderNotifications --no-verify-jwt
// Schedule: run every few minutes via pg_cron + pg_net (see below) or any
//           external cron hitting POST https://<project>.functions.supabase.co/order-notifications
//
// Secrets (supabase secrets set ...):  RESEND_API_KEY, EMAIL_FROM,
//   ORDER_ADMIN_EMAIL, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
//   WHATSAPP_ADMIN_PHONE, WHATSAPP_ORDER_TEMPLATE, WHATSAPP_TEMPLATE_BODY_PARAMS
//
// The function holds the SERVICE-ROLE key so it can claim/complete jobs;
// privileged provider keys therefore never exist in browser code.
// Each job is processed independently: one provider failure marks only that
// job 'failed' (with the error recorded) — orders and other jobs are untouched.
//
// pg_cron scheduling (run once in the SQL editor after deploying):
//   select cron.schedule('order-notifications', '*/5 * * * *', $$
//     select net.http_post(
//       url := 'https://<project-ref>.functions.supabase.co/order-notifications',
//       headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>'),
//       timeout_milliseconds := 20000);
//   $$);
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  adminEmail,
  buildWhatsappMessage,
  customerEmail,
  type JobRow,
  type WorkerSecrets,
} from './sendLogic.ts';

const env = Deno.env;
const SUPABASE_URL = env.get('SUPABASE_URL');
const SERVICE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY');


type Outcome = { processed: number; sent: number; failed: number; skipped: number };

async function respond(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      ...headers,
    },
  });
}

/** Cheap self-check: GET / → health probe for schedulers. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respond({}, 204, { 'Access-Control-Allow-Methods': 'GET, POST' });
  if (req.method === 'GET') return respond({ ok: true, service: 'order-notifications' });
  if (req.method !== 'POST') return respond({ error: 'method not allowed' }, 405);

  // Defence-in-depth: require a bearer token to trigger the worker. The real
  // authority check happens inside claim_notification_job() (service_role only).
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!SERVICE_KEY || token !== SERVICE_KEY) {
    return respond({ error: 'unauthorized — pass the service-role key as a bearer token' }, 401);
  }
  if (!SUPABASE_URL) return respond({ error: 'SUPABASE_URL missing' }, 500);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${SERVICE_KEY}` } },
    auth: { persistSession: false },
  });

  const secrets: WorkerSecrets = {
    RESEND_API_KEY: env.get('RESEND_API_KEY'),
    EMAIL_FROM: env.get('EMAIL_FROM'),
    ORDER_ADMIN_EMAIL: env.get('ORDER_ADMIN_EMAIL'),
    WHATSAPP_ACCESS_TOKEN: env.get('WHATSAPP_ACCESS_TOKEN'),
    WHATSAPP_PHONE_NUMBER_ID: env.get('WHATSAPP_PHONE_NUMBER_ID'),
    WHATSAPP_ADMIN_PHONE: env.get('WHATSAPP_ADMIN_PHONE'),
    WHATSAPP_ORDER_TEMPLATE: env.get('WHATSAPP_ORDER_TEMPLATE'),
    WHATSAPP_TEMPLATE_BODY_PARAMS: env.get('WHATSAPP_TEMPLATE_BODY_PARAMS'),
  };

  const outcome: Outcome = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  // Bound each invocation so a cron tick can't run away with the CPU.
  const MAX_JOBS_PER_RUN = 20;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const { data, error } = await sb.rpc('claim_notification_job');
    if (error) return respond({ error: `claim failed: ${error.message}`, outcome }, 500);
    const row = (Array.isArray(data) ? data[0] : data) as JobRow | null;
    if (!row) break; // queue drained
    outcome.processed++;
    const result = await processJob(sb, row, secrets);
    if (result === 'sent') outcome.sent++;
    else if (result === 'skipped') outcome.skipped++;
    else outcome.failed++;
  }

  return respond({ ok: true, outcome, resendConfigured: Boolean(secrets.RESEND_API_KEY && secrets.EMAIL_FROM), whatsappConfigured: Boolean(secrets.WHATSAPP_ACCESS_TOKEN && secrets.WHATSAPP_PHONE_NUMBER_ID) });
});

type JobResult = 'sent' | 'failed' | 'skipped';

async function processJob(
  sb: ReturnType<typeof createClient>,
  job: JobRow,
  secrets: WorkerSecrets,
): Promise<JobResult> {
  const complete = async (status: JobResult, error?: string, providerId?: string) => {
    const { error: dbErr } = await sb.rpc('complete_notification_job', {
      p_id: job.id, p_status: status, p_error: error ?? null, p_provider_id: providerId ?? null,
    });
    if (dbErr) console.error(`could not record outcome for job ${job.id}: ${dbErr.message}`);
    return status;
  };

  try {
    if (job.channel === 'email') {
      if (!secrets.RESEND_API_KEY || !secrets.EMAIL_FROM) {
        return complete('skipped', 'email not configured (RESEND_API_KEY / EMAIL_FROM secrets missing)');
      }
      const message = job.recipient_type === 'customer'
        ? customerEmail(job, secrets.EMAIL_FROM)
        : adminEmail(job, secrets.EMAIL_FROM, secrets.ORDER_ADMIN_EMAIL);
      if (!message.to[0]) return complete('skipped', 'no recipient address available');
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secrets.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      const text = await res.text();
      if (!res.ok) return complete('failed', `Resend ${res.status}: ${text.slice(0, 300)}`);
      let id: string | undefined;
      try { id = (JSON.parse(text) as { id?: string }).id; } catch { /* non-json ok */ }
      return complete('sent', undefined, id);
    }

    // ── WhatsApp (Meta Cloud API) ───────────────────────────────────────────
    const plan = buildWhatsappMessage(job, secrets);
    if (plan.kind === 'skip') return complete('skipped', plan.reason);
    if (!secrets.WHATSAPP_ACCESS_TOKEN) {
      return complete('skipped', 'WHATSAPP_ACCESS_TOKEN secret not configured');
    }
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${secrets.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${secrets.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(plan.payload),
      },
    );
    const text = await res.text();
    if (!res.ok) return complete('failed', `WhatsApp ${res.status}: ${text.slice(0, 300)}`);
    let waid: string | undefined;
    try {
      const parsed = JSON.parse(text) as { messages?: Array<{ id?: string }> };
      waid = parsed.messages?.[0]?.id;
    } catch { /* non-json ok */ }
    return complete('sent', undefined, waid);
  } catch (err) {
    // Unexpected errors (network aborts etc.) count against max_attempts too.
    return complete('failed', err instanceof Error ? err.message : String(err));
  }
}
// order-notifications worker — processes the durable outbox created by
// migration 0007_order_notifications.sql.
//
// Flow per invocation (schedule every ~1 min via supabase cron / GitHub Actions):
//   1. Require Bearer WORKER_SHARED_SECRET (or service-role JWT).
//   2. claim_notification_jobs(20) -> atomically flips due pending/failed rows
//      to 'sending' with FOR UPDATE SKIP LOCKED, so concurrent workers never
//      double-send the same job.
//   3. For each claimed job: load the order + items (service role), build the
//      message, send via Resend (email) or WhatsApp Cloud API, then call
//      complete_notification_job / fail_notification_job on THAT SAME ROW.
//      A failed provider call can never roll back or duplicate the order, and
//      a successfully-sent row is never re-queued.
//
// Secrets (supabase functions secrets set ...): RESEND_API_KEY, EMAIL_FROM,
// ORDER_ADMIN_EMAIL, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// WHATSAPP_ADMIN_PHONE, WHATSAPP_ORDER_TEMPLATE, WORKER_SHARED_SECRET.
import { adminClient, authorizeWorker } from '../_shared/supabaseClient.ts'

const MAX_ATTEMPTS = 6 // bounded retries; beyond this we mark permanently failed

type Job = {
  id: string
  order_id: string
  recipient_kind: 'customer' | 'admin'
  channel: 'email' | 'whatsapp'
  destination: string
  attempts: number
}

type OrderRow = {
  id: string
  email: string
  full_name: string
  address: string
  city: string
  pin: string
  total_paise: number
  items_subtotal_paise: number
  coating_subtotal_paise: number
  shipping_paise: number
  discount_paise: number
  status: string
  payment_status: string
  created_at: string
  phone?: string | null
}
type ItemRow = {
  product_name: string; size_label: string; quantity: number
  unit_price_paise: number; coating: boolean; colour_name: string | null
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`
const ref = (o: OrderRow) => `RB-${o.id.slice(0, 8).toUpperCase()}`

function lines(o: OrderRow, items: ItemRow[]): string {
  const rows = items.map((i) =>
    `• ${i.product_name} — ${i.size_label}${i.colour_name ? ` (${i.colour_name})` : ''} × ${i.quantity} — ${rupees(i.unit_price_paise * i.quantity)}${i.coating ? ' + coating' : ''}`,
  ).join('\n')
  return [
    rows,
    '',
    `Items subtotal: ${rupees(o.items_subtotal_paise)}`,
    o.coating_subtotal_paise ? `Stain coating: ${rupees(o.coating_subtotal_paise)}` : '',
    o.shipping_paise ? `Shipping: ${rupees(o.shipping_paise)}` : '',
    o.discount_paise ? `Discount: -${rupees(o.discount_paise)}` : '',
    `TOTAL: ${rupees(o.total_paise)} — Cash on Delivery`,
  ].filter(Boolean).join('\n')
}

async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new Error('RESEND_API_KEY not configured')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Rug Bunai <orders@rugbunai.example>',
      to: [to], subject, text,
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).id as string
}

async function sendWhatsApp(to: string, body: string): Promise<string> {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  if (!token || !phoneId) throw new Error('WhatsApp credentials not configured')
  const template = Deno.env.get('WHATSAPP_ORDER_TEMPLATE')
  const payload = template
    ? { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'template',
        template: { name: template, language: { code: 'en' },
          components: [{ type: 'body', parameters: [body.slice(0, 1024)] }] } }
    : { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text',
        text: { body: body.slice(0, 1024), preview_url: false } }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`WABA ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  return j.messages?.[0]?.id ?? 'waba-accepted'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { allow: 'POST' } })
  if (!authorizeWorker(req)) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const sb = adminClient()
  const { data: jobs, error: claimErr } = await sb.rpc('claim_notification_jobs', { p_limit: 20 })
  if (claimErr) return Response.json({ error: claimErr.message }, { status: 500 })

  const results: Array<{ id: string; status: string }> = []
  for (const job of (jobs ?? []) as Job[]) {
    try {
      if (!job.destination) throw new Error('no destination recorded')
      const { data: order } = await sb.from('orders')
        .select('*').eq('id', job.order_id).single<OrderRow>()
      if (!order) throw new Error('order not found')
      const { data: items } = await sb.from('order_items')
        .select('product_name,size_label,quantity,unit_price_paise,coating,colour_name')
        .eq('order_id', job.order_id).order('created_at')

      let messageId: string
      if (job.channel === 'email') {
        if (job.recipient_kind === 'customer') {
          messageId = await sendEmail(job.destination,
            `Rug Bunai order ${ref(order)} confirmed`,
            `Dear ${order.full_name},\n\nYour order ${ref(order)} has been placed and will be paid by Cash on Delivery.\n\n${lines(order, (items ?? []) as ItemRow[])}\n\nDeliver to: ${order.address}, ${order.city} ${order.pin}\nSupport: care@rugbunai.com\n\n— Rug Bunai`)
        } else {
          messageId = await sendEmail(job.destination,
            `New COD order ${ref(order)} — ${rupees(order.total_paise)}`,
            `New order ${ref(order)} at ${order.created_at}\nCustomer: ${order.full_name} <${order.email}> ${order.phone ?? ''}\nAddress: ${order.address}, ${order.city} ${order.pin}\n\n${lines(order, (items ?? []) as ItemRow[])}`)
        }
      } else {
        if (job.recipient_kind === 'customer') {
          messageId = await sendWhatsApp(job.destination,
            `Hi ${order.full_name}, your Rug Bunai order ${ref(order)} is confirmed (${rupees(order.total_paise)}, Cash on Delivery). We'll deliver to ${order.city}. Thank you!`)
        } else {
          messageId = await sendWhatsApp(job.destination,
            `New order ${ref(order)}: ${order.full_name} — ${rupees(order.total_paise)} COD — ${((items ?? []) as ItemRow[]).length} item(s).`)
        }
      }
      await sb.rpc('complete_notification_job', { p_id: job.id, p_provider_message_id: messageId })
      results.push({ id: job.id, status: 'sent' })
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err)
      if (job.attempts >= MAX_ATTEMPTS) {
        await sb.rpc('fail_notification_job', { p_id: job.id, p_error: `gave up after ${job.attempts} attempts: ${msg}` })
        // Flip to terminal state so it stops being retried forever.
        await sb.from('order_notifications').update({ status: 'skipped', last_error: `exhausted retries: ${msg}` }).eq('id', job.id)
        results.push({ id: job.id, status: 'failed-permanent' })
      } else {
        await sb.rpc('fail_notification_job', { p_id: job.id, p_error: msg })
        results.push({ id: job.id, status: 'failed-retry' })
      }
    }
  }
  return Response.json({ claimed: (jobs ?? []).length, results })
})
