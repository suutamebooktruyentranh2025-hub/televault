# TeleVault Supabase add-ons

These resources are **TeleVault-only**. Crawler continues using `resolve-user-profile` and its existing tables unchanged.

## Migration history (shared with crawler)

Copy crawler migrations into `supabase/migrations/` so CLI history matches remote:

```bash
cp /path/to/crawler/supabase/migrations/202604291*.sql supabase/migrations/
```

Remote may include `20260429130000` even if that file is missing from crawler git — keep
`20260429130000_remote_history_placeholder.sql` (no-op) for history alignment only.

Then:

```bash
supabase link --project-ref eurlodsgnskbqjpxtcsh
supabase db push   # applies only new TeleVault migrations (e.g. 20260704100000)
```

## Deploy

```bash
# From repo root, with Supabase CLI linked to project eurlodsgnskbqjpxtcsh
supabase db push
supabase functions deploy resolve-televault-access
supabase functions deploy consume-televault-credit
```

## Grant access (admin) — two independent products

Crawler and TeleVault use **separate tables**. Granting crawler `Member` does **not** grant TeleVault.

| App | Table | Full access when |
|---|---|---|
| Crawler | `user_type_allowlist` + `user_profiles` | `user_type` = Member / Super / Premium / Admin |
| TeleVault | `televault_entitlements` | `tier` = member / super member / premium member / admin |

Scripts: `supabase/admin/grant-crawler-member.sql`, `supabase/admin/grant-televault-member.sql`.

### TeleVault Member = full quyền

- **Không** giới hạn 100 token upload
- **Không** hết hạn trial 7 ngày
- **Không** đọc `user_type_allowlist` hay trạng thái crawler
- `remaining_tokens` **không dùng** cho tier member (app bỏ qua)

Grant **trước khi login** (upsert theo email):

```sql
WITH target_emails(email) AS (
  VALUES ('user@example.com')
)
INSERT INTO public.televault_entitlements (email, tier, implied_free)
SELECT lower(trim(email)), 'member', false
FROM target_emails
ON CONFLICT (email) DO UPDATE
SET
  tier = EXCLUDED.tier,
  implied_free = EXCLUDED.implied_free,
  updated_at = now();
```

Login TeleVault → `resolve-televault-access` → `televaultTier: Member` → full quyền.

Tiers: `free`, `member`, `super member`, `premium member`, `admin` (lowercase in DB).

### Crawler Member (riêng)

```sql
-- see supabase/admin/grant-crawler-member.sql
INSERT INTO public.user_type_allowlist (email, user_type) ...
```

## Client contract

`resolve-televault-access` response (TeleVault-only — not crawler `userType`):

```json
{
  "ok": true,
  "entitlementSource": "televault",
  "email": "...",
  "televaultTier": "Free",
  "televaultImpliedFree": true,
  "remainingTokens": 100
}
```

`consume-televault-credit` — body `{ "destPath": "/folder/file" }`, response:

```json
{ "ok": true, "remainingTokens": 99, "needLogin": false }
```
