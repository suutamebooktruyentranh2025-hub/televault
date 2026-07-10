-- TeleVault Member (full access) — batch grant 2026-07-04
-- Independent from crawler user_type_allowlist.

WITH target_emails(email) AS (
  VALUES
    ('le.buuri@gmail.com'),
    ('truongnam24@gmail.com'),
    ('pinkvagreen@gmail.com'),
    ('Chubenoel@gmail.com'),
    ('spotify.mighty89@gmail.com'),
    ('quangphuocn4@gmail.com'),
    ('louis.data.12715@gmail.com'),
    ('louispham2020@gmail.com'),
    ('linhnv2590@gmail.com'),
    ('tumx281190@gmail.com'),
    ('hoangpham7602119@gmail.com'),
    ('kaitoukiddie@gmail.com'),
    ('hieudtx9@gmail.com'),
    ('dstrvth@gmail.com'),
    ('quocnhat160490@gmail.com'),
    ('nqdonghy90@gmail.com'),
    ('nguyenthaiha1986@gmail.com'),
    ('Ocean1791@gmail.com'),
    ('phamkhanhthaiduy@gmail.com'),
    ('luongkhactam@gmail.com'),
    ('kts.dangquang@gmail.com'),
    ('dinh.huynh288@gmail.com'),
    ('dongnguyenvu0405@gmail.com'),
    ('ugtrongdat02@gmail.com')
)
INSERT INTO public.televault_entitlements (email, tier, implied_free)
SELECT
  lower(trim(email)),
  'member',
  false
FROM target_emails
ON CONFLICT (email) DO UPDATE
SET
  tier = EXCLUDED.tier,
  implied_free = EXCLUDED.implied_free,
  updated_at = now();
