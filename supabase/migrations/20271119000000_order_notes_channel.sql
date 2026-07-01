-- Note interne di commessa collaborative: un canale Chat Team può essere il
-- "gruppo della commessa". Aggiunge order_id (opzionale) a internal_chat_channels
-- così il canale è legato all'ordine e appare in Chat Team. Riusa tutta
-- l'infrastruttura chat esistente (membri, messaggi, realtime, RLS company-scoped).
ALTER TABLE public.internal_chat_channels
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_internal_chat_channels_order
  ON public.internal_chat_channels(order_id);
