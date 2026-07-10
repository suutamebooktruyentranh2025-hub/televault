import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MEMBER_TIERS = new Set(['member', 'super member', 'premium member', 'admin']);
const DEFAULT_TOKENS = 100;

function displayTelevaultTier(raw: string): string {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'super member') return 'Super Member';
  if (normalized === 'premium member') return 'Premium Member';
  if (normalized === 'member') return 'Member';
  return 'Free';
}

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

  let defaultTokens = DEFAULT_TOKENS;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = Number(body?.defaultTokens);
    if (Number.isFinite(parsed) && parsed >= 0) {
      defaultTokens = Math.floor(parsed);
    }
  } catch {
    /* empty body is fine */
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
  if (userError || !userData.user?.email) {
    return json(401, { ok: false, error: userError?.message ?? 'Invalid token' });
  }

  const email = userData.user.email.trim().toLowerCase();
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: existing, error: selectError } = await admin
    .from('televault_entitlements')
    .select('tier, remaining_tokens, implied_free, created_at')
    .eq('email', email)
    .maybeSingle();

  if (selectError) {
    return json(500, { ok: false, error: selectError.message });
  }

  let row = existing;
  if (!row) {
    const { data: inserted, error: insertError } = await admin
      .from('televault_entitlements')
      .insert({
        email,
        user_id: userId,
        tier: 'free',
        remaining_tokens: defaultTokens,
        implied_free: true,
      })
      .select('tier, remaining_tokens, implied_free, created_at')
      .single();

    if (insertError) {
      const { data: raced, error: raceError } = await admin
        .from('televault_entitlements')
        .select('tier, remaining_tokens, implied_free, created_at')
        .eq('email', email)
        .maybeSingle();
      if (raceError || !raced) {
        return json(500, { ok: false, error: insertError.message });
      }
      row = raced;
    } else {
      row = inserted;
    }
  } else {
    await admin
      .from('televault_entitlements')
      .update({ user_id: userId })
      .eq('email', email)
      .is('user_id', null);
  }

  const tier = String(row.tier || 'free').trim().toLowerCase();
  const isMember = MEMBER_TIERS.has(tier);

  return json(200, {
    ok: true,
    email,
    entitlementSource: 'televault',
    televaultTier: displayTelevaultTier(tier),
    televaultImpliedFree: isMember ? false : row.implied_free !== false,
    remainingTokens: row.remaining_tokens ?? defaultTokens,
    televaultEntitlementCreatedAt: row.created_at ?? null,
  });
});
