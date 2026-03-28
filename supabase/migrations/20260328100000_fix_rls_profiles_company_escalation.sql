-- SEC-017: Fix RLS profiles FOR UPDATE — company_id escalation vulnerability
--
-- Vulnerabilità identificata: la policy "Users can update their own profile"
-- usava ONLY USING (id = auth.uid()) senza WITH CHECK.
-- In PostgreSQL, quando manca WITH CHECK su un UPDATE policy,
-- Postgres usa USING come WITH CHECK **solo se USING riguarda la riga corrente**.
-- Ma poiché la condizione è `id = auth.uid()` (non company_id),
-- un utente autenticato poteva modificare il proprio company_id a piacere,
-- ottenendo accesso a tutti i dati di un'altra azienda.
--
-- Fix: aggiungere WITH CHECK che impedisce la modifica di company_id,
-- usando get_my_company_id() che è SECURITY DEFINER e legge il valore
-- corrente dal DB (pre-update), non quello proposto.

-- Rimuovi la policy vulnerabile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Ricrea con WITH CHECK che blocca l'escalation di company_id
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND company_id = public.get_my_company_id()
  );

-- Nota: get_my_company_id() è SECURITY DEFINER (non soggetto a RLS)
-- e restituisce il company_id corrente dell'utente dal database.
-- Poiché viene valutata PRIMA del commit dell'UPDATE,
-- restituisce il valore originale — bloccando qualsiasi tentativo
-- di cambiare company_id verso un'altra azienda.
