-- Contatti del call center: «lo segue in un'opportunità» si calcola una volta
-- per richiesta, non una volta per contatto.
--
-- 14/09/2026, BeMade. Fra le 14:35 e le 15:15 il database annullava decine di
-- query per timeout e Venusia veniva rimandata al login. Le letture più
-- pesanti erano le liste contatti del call center (in media 4,9 s, fino a
-- 8 s): ogni pagina chiede anche il conteggio esatto, cioè legge tutti i
-- 20.601 contatti dell'azienda, e per ognuno le policy chiamavano
-- `contatto_seguito_da_me(id)`. È una funzione SECURITY DEFINER, che il
-- pianificatore non può espandere: una sottoquery sulle opportunità per ogni
-- riga. Anche a database tranquillo il conteggio costava 1,0 s a Venusia e
-- 0,7 s ad Antonella.
--
-- Ora le stesse policy chiedono `id IN (SELECT contatti_seguiti_da_me())`:
-- l'insieme dei contatti che l'utente segue nelle opportunità si calcola una
-- volta per richiesta (1.145 per Venusia, 5.480 per Antonella) e ogni riga fa
-- solo un confronto in tabella hash. Il significato non cambia: contatto con
-- un'opportunità non cancellata in cui l'utente è venditore, call center o
-- follower. Stesso metodo del giro sulle funzioni per riga, vedi
-- 20280914200001 e seguenti.
--
-- La riscrittura avviene dentro il database sul testo attuale delle policy:
-- si sostituisce solo la chiamata, il resto dell'espressione resta com'è, e
-- rieseguire la migrazione non cambia nulla. Se la chiamata compare in una
-- forma diversa da quella attesa, ci si ferma senza toccare niente.
--
-- Verifica: prima e dopo, impersonando Venusia e Antonella, stessi contatti e
-- stesse note visibili (conteggio e impronta degli id).

SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.contatti_seguiti_da_me()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT o.contact_id
    FROM public.marketing_opportunities o
   WHERE o.contact_id IS NOT NULL
     AND o.deleted_at IS NULL
     AND (SELECT auth.uid()) IN (o.assigned_to, o.call_center_id, o.follower_id);
$function$;

REVOKE ALL ON FUNCTION public.contatti_seguiti_da_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contatti_seguiti_da_me() TO authenticated, service_role;

DO $$
DECLARE
  r        record;
  v_nuovo  text;
  v_fatte  integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tabella, p.polname AS policy, pg_get_expr(p.polqual, p.polrelid) AS espressione
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE (c.relname, p.polname) IN (
             ('marketing_contacts', 'Staff can manage marketing contacts if permitted'),
             ('marketing_contacts', 'Staff can view marketing contacts if permitted'),
             ('marketing_contact_notes', 'Staff can view contact notes if permitted'))
  LOOP
    IF r.espressione IS NULL OR position('contatto_seguito_da_me(' IN r.espressione) = 0 THEN
      CONTINUE;  -- già riscritta, oppure cambiata da altri: non si tocca
    END IF;

    v_nuovo := replace(replace(r.espressione,
      'contatto_seguito_da_me(id)',
      '(id IN ( SELECT contatti_seguiti_da_me() AS contatti_seguiti_da_me))'),
      'contatto_seguito_da_me(c.id)',
      '(c.id IN ( SELECT contatti_seguiti_da_me() AS contatti_seguiti_da_me))');

    IF position('contatto_seguito_da_me(' IN v_nuovo) > 0 THEN
      RAISE EXCEPTION 'Policy «%» su %: contatto_seguito_da_me in una forma inattesa, nessuna modifica',
        r.policy, r.tabella;
    END IF;

    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policy, r.tabella, v_nuovo);
    v_fatte := v_fatte + 1;
  END LOOP;

  RAISE NOTICE 'policy riscritte: %', v_fatte;
END $$;
