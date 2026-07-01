-- Notifica in campanella (notifications) quando in un canale DI COMMESSA
-- (internal_chat_channels.order_id NOT NULL) un messaggio menziona qualcuno.
-- SECURITY DEFINER: crea notifiche per altri utenti bypassando la RLS.
-- Il client inserisce solo il messaggio con mentions[]; le notifiche sono automatiche.
CREATE OR REPLACE FUNCTION public.notify_order_channel_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord_id UUID;
  ord_code TEXT;
  mentioned UUID;
BEGIN
  SELECT c.order_id INTO ord_id FROM public.internal_chat_channels c WHERE c.id = NEW.channel_id;
  IF ord_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT order_code INTO ord_code FROM public.orders WHERE id = ord_id;

  IF NEW.mentions IS NOT NULL THEN
    FOREACH mentioned IN ARRAY NEW.mentions LOOP
      IF mentioned IS NOT NULL AND mentioned <> NEW.sender_id THEN
        INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
        VALUES (
          NEW.company_id, mentioned, 'order_note',
          'Nota commessa ' || COALESCE(ord_code, ''),
          left(NEW.content, 140), 'order', ord_id,
          '/azienda/ordini/' || ord_id::text
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_channel_mentions ON public.internal_chat_messages;
CREATE TRIGGER trg_notify_order_channel_mentions
AFTER INSERT ON public.internal_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_order_channel_mentions();
