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
