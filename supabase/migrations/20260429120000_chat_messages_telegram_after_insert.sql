-- Forward new chat_messages rows to Edge Function telegram-forward (Telegram notify).
-- Requires: pg_net extension; telegram-forward with verify_jwt=false (see supabase/config.toml).
-- English comments only per project convention.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_telegram_on_chat_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  forward_url text := 'https://eurlodsgnskbqjpxtcsh.supabase.co/functions/v1/telegram-forward';
  internal_bearer text := 'tg_forward_internal_bearer_2026_04_25_d6';
  request_body jsonb;
BEGIN
  request_body := jsonb_build_object(
    'message_id', NEW.id::text,
    'profile_id', NEW.profile_id::text,
    'content', NEW.content
  );

  PERFORM net.http_post(
    url := forward_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || internal_bearer
    ),
    body := request_body
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_after_insert_telegram ON public.chat_messages;

CREATE TRIGGER trg_chat_messages_after_insert_telegram
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_on_chat_message_insert();
