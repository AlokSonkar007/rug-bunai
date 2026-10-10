import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Bearer token must match WORKER_SHARED_SECRET so random callers cannot trigger sends.
export function authorizeWorker(req: Request): boolean {
  const secret = Deno.env.get('WORKER_SHARED_SECRET')
  if (!secret) return true // local/dev only
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}` || auth === secret
}
