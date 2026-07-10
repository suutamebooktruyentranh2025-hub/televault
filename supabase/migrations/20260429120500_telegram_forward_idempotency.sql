-- Idempotency for telegram-forward: at most one successful Telegram send per chat_messages row.
-- English comments only per project convention.

CREATE TABLE IF NOT EXISTS public.telegram_forward_log (
  chat_message_id uuid NOT NULL PRIMARY KEY REFERENCES public.chat_messages (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_forward_log ENABLE ROW LEVEL SECURITY;
