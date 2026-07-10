-- Grant Crawler Member only (user_type_allowlist — TeleVault unchanged).

WITH target_emails(email) AS (
  VALUES
    ('nghiaplh912@gmail.com')
)
INSERT INTO public.user_type_allowlist (email, user_type)
SELECT
  lower(trim(email)),
  'Member'
FROM target_emails
ON CONFLICT (email) DO UPDATE
SET
  user_type = EXCLUDED.user_type,
  updated_at = now();
