-- Outreach a freddo, audit dell'11/09/2026.
-- 1) Register genera un selettore DKIM univoco per dominio: il verificatore
--    provava solo una lista di selettori noti e non lo trovava mai, così i
--    domini restavano «verifying» pur firmando. Il selettore si può scrivere
--    a mano sul dominio; la verifica lo controlla per primo.
-- 2) Via d'uscita dello stile umano: niente List-Unsubscribe (Gmail lo mostra
--    come «Annulla iscrizione»), ma una frase nel corpo che invita a
--    rispondere «no». Per brand, con un default sensato.
ALTER TABLE public.outreach_sending_domains ADD COLUMN IF NOT EXISTS dkim_selector text;
ALTER TABLE public.outreach_brands ADD COLUMN IF NOT EXISTS frase_uscita text;
COMMENT ON COLUMN public.outreach_sending_domains.dkim_selector IS 'Selettore DKIM del dominio (es. quello univoco generato da Register): la verifica DNS lo prova per primo.';
COMMENT ON COLUMN public.outreach_brands.frase_uscita IS 'Frase di chiusura aggiunta ai messaggi in stile umano che non ne hanno una (NULL = «Se non ti interessa, rispondi «no» e non ti scrivo più.»).';
