-- Chi ha dato l'ok a una campagna sopra soglia, e quando.
--
-- Il tetto di spesa bloccava la pubblicazione sopra 30 €/giorno chiedendo un
-- «super_admin»: cioè l'amministratore della piattaforma, non il titolare
-- dell'impresa. In pratica nessun cliente poteva mandare online una campagna
-- con un budget vero, e il flusso di approvazione del titolare che esiste già
-- (stato «review» → Approva) non contava niente.
--
-- Da qui in avanti la soglia chiede l'ok del titolare, e resta scritto chi
-- l'ha dato.
ALTER TABLE public.meta_campaigns
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

COMMENT ON COLUMN public.meta_campaigns.approved_by IS
  'Titolare (company_admin) o super_admin che ha approvato la campagna dal flusso di revisione.';
COMMENT ON COLUMN public.meta_campaigns.approved_at IS
  'Quando è arrivato l''ok. Sopra la soglia di budget la pubblicazione lo richiede.';
