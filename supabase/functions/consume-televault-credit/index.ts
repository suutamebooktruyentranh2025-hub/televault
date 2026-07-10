import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MEMBER_TIERS = new Set(['member', 'super member', 'premium member', 'admin']);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(500, { ok: false, error: 'Supabase env not configured' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return json(401, { ok: false, error: 'Missing bearer token' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
  if (userError || !userData.user?.email) {
    return json(401, { ok: false, error: userError?.message ?? 'Invalid token' });
  }

  const email = userData.user.email.trim().toLowerCase();
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: row, error: selectError } = await admin
    .from('televault_entitlements')
    .select('tier, remaining_tokens')
    .eq('email', email)
    .maybeSingle();

  if (selectError) {
    return json(500, { ok: false, error: selectError.message });
  }
  if (!row) {
    return json(404, { ok: false, error: 'TeleVault entitlement not found', needLogin: true });
  }

  const tier = String(row.tier || 'free').trim().toLowerCase();
  if (MEMBER_TIERS.has(tier)) {
    return json(200, {
      ok: true,
      skipped: true,
      remainingTokens: row.remaining_tokens ?? 0,
    });
  }

  const remaining = Number(row.remaining_tokens ?? 0);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return json(200, {
      ok: false,
      needLogin: true,
      remainingTokens: 0,
    });
  }

  const next = remaining - 1;
  const { data: updated, error: updateError } = await admin
    .from('televault_entitlements')
    .update({ remaining_tokens: next })
    .eq('email', email)
    .eq('remaining_tokens', remaining)
    .select('remaining_tokens')
    .maybeSingle();

  if (updateError) {
    return json(500, { ok: false, error: updateError.message });
  }
  if (!updated) {
    return json(409, { ok: false, error: 'Credit race — retry' });
  }

  return json(200, {
    ok: true,
    remainingTokens: updated.remaining_tokens ?? next,
    needLogin: (updated.remaining_tokens ?? next) <= 0,
  });
});
