-- Authenticated user profiles, free-tier download credits, allowlist, and RPCs for Edge/app.

DROP FUNCTION IF EXISTS public.normalize_user_type(text);
DROP FUNCTION IF EXISTS public.ensure_current_user_profile(integer);
DROP FUNCTION IF EXISTS public.consume_current_user_download_token(text, text);
DROP TABLE IF EXISTS public.memberships;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  user_type text NOT NULL DEFAULT 'Free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT user_profiles_email_normalized CHECK (email = lower(trim(email))),
  CONSTRAINT user_profiles_user_type_check CHECK (
    user_type IN ('Free', 'Member', 'Super Member', 'Premium Member', 'Admin')
  )
);

CREATE TABLE IF NOT EXISTS public.free_user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  remaining_tokens integer NOT NULL DEFAULT 100 CHECK (remaining_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_user_credits_email_normalized CHECK (email = lower(trim(email)))
);

CREATE TABLE IF NOT EXISTS public.user_type_allowlist (
  email text PRIMARY KEY,
  user_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_type_allowlist_email_normalized CHECK (email = lower(trim(email))),
  CONSTRAINT user_type_allowlist_user_type_check CHECK (
    user_type IN ('Member', 'Super Member', 'Premium Member', 'Admin')
  )
);

CREATE INDEX IF NOT EXISTS user_profiles_email_idx ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS user_type_allowlist_user_type_idx ON public.user_type_allowlist(user_type);

CREATE OR REPLACE FUNCTION public.normalize_user_type(p_user_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_user_type, '')))
    WHEN 'admin' THEN 'Admin'
    WHEN 'premium member' THEN 'Premium Member'
    WHEN 'super member' THEN 'Super Member'
    WHEN 'member' THEN 'Member'
    WHEN 'free' THEN 'Free'
    ELSE 'Free'
  END
$$;

CREATE OR REPLACE FUNCTION public.ensure_current_user_profile(p_default_tokens integer DEFAULT 100)
RETURNS TABLE(
  email text,
  user_type text,
  implied_supabase_free boolean,
  remaining_tokens integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_user_type text := 'Free';
  v_allowlist_user_type text;
  v_default_tokens integer := greatest(0, coalesce(p_default_tokens, 100));
  v_remaining integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user is required';
  END IF;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'authenticated email is required';
  END IF;

  SELECT a.user_type INTO v_allowlist_user_type
  FROM public.user_type_allowlist a
  WHERE a.email = v_email;

  v_user_type := coalesce(v_allowlist_user_type, 'Free');

  INSERT INTO public.user_profiles AS p(
    id,
    email,
    user_type,
    last_login_at
  )
  VALUES (
    v_user_id,
    v_email,
    v_user_type,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = excluded.email,
      user_type = excluded.user_type,
      last_login_at = now(),
      updated_at = now();

  SELECT p.user_type INTO v_user_type
  FROM public.user_profiles p
  WHERE p.id = v_user_id;

  IF v_user_type = 'Free' THEN
    INSERT INTO public.free_user_credits(user_id, email, remaining_tokens)
    VALUES (v_user_id, v_email, v_default_tokens)
    ON CONFLICT (user_id) DO UPDATE
    SET email = excluded.email,
        updated_at = now();
  END IF;

  SELECT c.remaining_tokens INTO v_remaining
  FROM public.free_user_credits c
  WHERE c.user_id = v_user_id;

  RETURN QUERY SELECT v_email, v_user_type, v_user_type = 'Free', coalesce(v_remaining, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_current_user_download_token(
  p_manga_url text DEFAULT NULL,
  p_chapter_url text DEFAULT NULL
)
RETURNS TABLE(ok boolean, remaining_tokens integer, need_login boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_user_type text;
  v_remaining integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, true;
    RETURN;
  END IF;

  PERFORM public.ensure_current_user_profile(100);

  SELECT p.user_type INTO v_user_type
  FROM public.user_profiles p
  WHERE p.id = v_user_id;

  IF v_user_type IS DISTINCT FROM 'Free' THEN
    RETURN QUERY SELECT true, 0, false;
    RETURN;
  END IF;

  UPDATE public.free_user_credits AS c
  SET remaining_tokens = c.remaining_tokens - 1,
      updated_at = now()
  WHERE c.user_id = v_user_id
    AND c.remaining_tokens > 0
  RETURNING c.remaining_tokens INTO v_remaining;

  IF v_remaining IS NULL THEN
    RETURN QUERY SELECT false, 0, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_remaining, false;
END;
$$;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_type_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can read own free credits" ON public.free_user_credits;
CREATE POLICY "Users can read own free credits"
  ON public.free_user_credits
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.user_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.free_user_credits FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_type_allowlist FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT SELECT ON TABLE public.free_user_credits TO authenticated;
GRANT ALL ON TABLE public.user_type_allowlist TO service_role;

REVOKE ALL ON FUNCTION public.normalize_user_type(text) FROM public;
REVOKE ALL ON FUNCTION public.ensure_current_user_profile(integer) FROM public;
REVOKE ALL ON FUNCTION public.consume_current_user_download_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_current_user_profile(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_current_user_download_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_user_type(text) TO service_role;
