-- Identita' unica del cliente-servizio, e da li' il valore per cliente.
--
-- PROBLEMA. aedix_service_clients diceva chi e' il cliente in tre modi
-- alternativi e tutti facoltativi: contact_id (contatto CRM), company_id
-- (azienda su Edilizia in Cloud), oppure il solo cliente_nome scritto a mano.
-- Con tre modi e nessun obbligo, lo stesso cliente che compra piu' volte
-- diventa righe scollegate: Mario che prende Vendita Edile a marzo, un webinar
-- a giugno e Marketing Edile a settembre puo' benissimo risultare tre clienti
-- diversi. Cosi' "quanto vale Mario" non e' una query difficile: e' una query
-- impossibile, perche' il dato per rispondere non esiste.
--
-- DECISIONE. Il cliente e' SEMPRE un contatto CRM (marketing_contacts).
-- L'azienda diventa un attributo, non un'alternativa:
--   contact_id  → CHI e' il cliente. Obbligatorio, e' l'identita'.
--   company_id  → SE quel cliente e' anche un'azienda su Edilizia in Cloud,
--                 quale. Facoltativo, serve a incrociare SaaS e servizi.
--   cliente_nome→ etichetta denormalizzata per la lista, non un'identita'.
--
-- Si fa ORA perche' la tabella e' vuota (0 righe al 31/08/2026): non c'e' nulla
-- da bonificare. Fra sei mesi, con lo storico dentro, sarebbe una migrazione
-- dolorosa e a perdita di dati.

-- 1. Il contatto diventa obbligatorio.
ALTER TABLE public.aedix_service_clients
  ALTER COLUMN contact_id SET NOT NULL;

-- 2. Un contatto che paga non si cancella per sbaglio. Con SET NULL la riga
--    restava orfana e il fatturato perdeva silenziosamente il suo cliente.
ALTER TABLE public.aedix_service_clients
  DROP CONSTRAINT IF EXISTS aedix_service_clients_contact_id_fkey;
ALTER TABLE public.aedix_service_clients
  ADD CONSTRAINT aedix_service_clients_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.marketing_contacts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS aedix_service_clients_contact_idx
  ON public.aedix_service_clients (contact_id);

COMMENT ON COLUMN public.aedix_service_clients.contact_id IS
  'CHI e'' il cliente. Obbligatorio: e'' l''identita'' su cui si aggregano gli acquisti ripetuti e il valore.';
COMMENT ON COLUMN public.aedix_service_clients.company_id IS
  'SE il cliente e'' anche un''azienda su Edilizia in Cloud, quale. Attributo facoltativo, NON un modo alternativo di identificarlo.';
COMMENT ON COLUMN public.aedix_service_clients.cliente_nome IS
  'Etichetta denormalizzata per le liste. Non e'' un''identita'': la verita'' e'' contact_id.';

-- 3. Il valore per cliente: tutto quello che una persona ha comprato, in una riga.
--    security_invoker: la vista deve rispettare la RLS super-admin delle tabelle
--    sotto. Senza, girerebbe coi permessi del proprietario e diventerebbe un
--    modo per leggere i dati scavalcando le policy.
CREATE OR REPLACE VIEW public.v_aedix_valore_cliente
WITH (security_invoker = true) AS
SELECT
  sc.contact_id,
  max(sc.cliente_nome)                                   AS cliente_nome,
  count(*)                                               AS servizi_acquistati,
  count(*) FILTER (WHERE sc.stato = 'attivo')            AS servizi_attivi,
  min(sc.data_inizio)                                    AS primo_acquisto,
  max(sc.data_inizio)                                    AS ultimo_acquisto,
  COALESCE(sum(b.dovuto), 0)                             AS totale_dovuto,
  COALESCE(sum(b.incassato), 0)                          AS totale_incassato,
  max(b.ultimo_incasso)                                  AS ultimo_incasso,
  -- Ricorrente stimato: solo le relazioni attive a importo fisso mensile.
  COALESCE(sum(sc.importo) FILTER (
    WHERE sc.stato = 'attivo' AND sc.ricorrenza = 'mensile'
      AND sc.billing_model <> 'provvigione'), 0)         AS ricorrente_mese,
  array_agg(DISTINCT pl.nome) FILTER (WHERE pl.nome IS NOT NULL) AS servizi
FROM public.aedix_service_clients sc
LEFT JOIN public.aedix_product_lines pl ON pl.id = sc.product_line_id
LEFT JOIN LATERAL (
  SELECT sum(x.importo_dovuto)    AS dovuto,
         sum(x.importo_incassato) AS incassato,
         max(x.data_incasso)      AS ultimo_incasso
  FROM public.aedix_service_billings x
  WHERE x.service_client_id = sc.id
) b ON true
GROUP BY sc.contact_id;

COMMENT ON VIEW public.v_aedix_valore_cliente IS
  'Valore per cliente: quante volte ha comprato, quali servizi, quanto ha generato e quanto ha davvero pagato. Aggrega su contact_id, che dal 31/08/2026 e'' l''identita'' obbligatoria del cliente-servizio.';
