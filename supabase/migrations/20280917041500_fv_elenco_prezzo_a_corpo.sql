-- Elenco preventivi fotovoltaici: l'importo di una bozza col prezzo a corpo.
--
-- Un'azienda senza listino preventiva scrivendo il prezzo a mano. Il totale IVA
-- inclusa però lo scrive solo il calcolo finanziario, e l'elenco mostrava 0 €
-- su bozze col prezzo già scritto (Suntech: 18.000 € e 13.900 €). La vista
-- espone gli ingredienti — prezzo a corpo, kit, aliquota — e l'app ricava
-- l'importo. Colonne aggiunte in coda: CREATE OR REPLACE lo consente e i
-- permessi restano quelli di prima.

create or replace view public.v_fv_progetti_dashboard
with (security_invoker = on) as
select
  p.id,
  p.company_id,
  p.numero,
  p.titolo,
  p.stato,
  p.archetipo,
  p.indirizzo,
  p.comune,
  trim(both from (coalesce(c.first_name, ''::text) || ' '::text) || coalesce(c.last_name, ''::text)) as cliente_nome,
  p.potenza_kwp,
  p.prezzo_vendita_iva_inclusa,
  p.margine_eur,
  p.margine_pct,
  p.payback_anni,
  p.created_at,
  p.updated_at,
  p.emesso_il,
  p.firmato_il,
  p.prezzo_vendita_manuale,
  p.kit_bundle_id,
  p.kit_prezzo,
  p.iva_aliquota
from public.fv_progetti p
  left join public.marketing_contacts c on c.id = p.cliente_id
where p.annullato = false and p.deleted_at is null;
