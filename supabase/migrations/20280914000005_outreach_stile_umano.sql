-- «Stile umano» per le email a freddo di un brand (10/09/2026).
--
-- L'obiettivo del founder: un'email dell'outreach deve sembrare scritta da una
-- persona dal suo client di posta, non da un sistema. L'involucro lo è già
-- (intestazioni, Message-ID, data, From, HTML). Restavano tre impronte che
-- una persona non lascia mai: le intestazioni List-Unsubscribe, il link di
-- disiscrizione tracciato nel footer, il pixel. Con stile_umano attivo:
--   - niente List-Unsubscribe / List-Unsubscribe-Post;
--   - niente link di disiscrizione: una frase («rispondimi "no" e non ti
--     scrivo più») — la risposta la legge il poller, che già classifica
--     l'intento (not_interested → sequenza ferma, unsubscribe → opt-out);
--   - niente pixel di apertura, anche se la sequenza lo chiedesse;
--   - i follow-up citano il messaggio precedente, come fa chi risponde.
-- Il footer con l'indirizzo e la base giuridica resta: è una riga, e la legge
-- la vuole.

ALTER TABLE public.outreach_brands
  ADD COLUMN IF NOT EXISTS stile_umano boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.outreach_brands.stile_umano IS
  'true = le email a freddo escono come posta scritta a mano: niente List-Unsubscribe, niente link/pixel di tracciamento, opt-out rispondendo, follow-up che citano il messaggio precedente.';
