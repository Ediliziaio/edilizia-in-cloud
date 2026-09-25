-- Moduli di vendita: Ristrutturazione ha il suo permesso, le descrizioni dicono il
-- vero, la vista unificata non conta due volte i preventivi dei moduli (25/09/2026).
--
-- Dall'audit dei moduli di vendita del 25/09:
-- · modulo_ristrutturazione_attivo non era mai stato creato. Nella griglia dei
--   moduli Ristrutturazione risultava «bloccato» per tutti, ma si apriva
--   dall'indirizzo, perché le rotte dei moduli edili non controllavano il piano.
--   Da oggi lo controllano (FeatureRoute, come il Fotovoltaico): il permesso nasce
--   uguale a quello di Bagni — stessi piani, stessa anteprima, stesse aziende
--   sbloccate a mano — così nessuna azienda ha su Ristrutturazione un accesso
--   diverso da quello che ha sugli altri moduli edili.
-- · Serramenti, Tetti e Bagni sono disponibili: via «(In arrivo)» dalle descrizioni.
-- · v_preventivi_unificati: le righe di quotes con source «modulo:…» sono la copia
--   di firma di un preventivo di modulo (src/lib/moduli/quoteBridge.ts). Il
--   preventivo c'è già nella vista dalla tabella del modulo: non va contato una
--   seconda volta come preventivo classico.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Il permesso di Ristrutturazione, uguale a quello di Bagni ---------------------------
insert into public.platform_feature_flags
  (key, icon, name, is_beta, category, sort_order, description,
   default_value, plans_included, price_per_month, supports_preview)
select 'modulo_ristrutturazione_attivo', 'Hammer', 'Ristrutturazione', b.is_beta, b.category, 111,
       'Preventivatore ristrutturazioni: computo metrico per capitoli dai listini aziendali, margini e preventivo PDF.',
       b.default_value, b.plans_included, b.price_per_month, b.supports_preview
  from public.platform_feature_flags b
 where b.key = 'modulo_bagni_attivo'
on conflict (key) do nothing;

insert into public.company_feature_overrides
  (company_id, feature_key, is_enabled, access_level, limit_value, price_override,
   expires_at, notes, override_reason)
select o.company_id, 'modulo_ristrutturazione_attivo', o.is_enabled, o.access_level, o.limit_value,
       o.price_override, o.expires_at, o.notes,
       coalesce(o.override_reason, 'Come Bagni: stesso accesso ai moduli edili (25/09/2026)')
  from public.company_feature_overrides o
 where o.feature_key = 'modulo_bagni_attivo'
on conflict (company_id, feature_key) do nothing;

insert into public.plan_feature_defaults
  (plan_id, feature_key, is_enabled, access_level, limit_value, credits_included, credit_type, notes)
select d.plan_id, 'modulo_ristrutturazione_attivo', d.is_enabled, d.access_level, d.limit_value,
       d.credits_included, d.credit_type, d.notes
  from public.plan_feature_defaults d
 where d.feature_key = 'modulo_bagni_attivo'
on conflict (plan_id, feature_key) do nothing;

-- 2. Descrizioni: i moduli disponibili non sono «in arrivo» --------------------------------
update public.platform_feature_flags
   set description = regexp_replace(description, '\s*\(In arrivo\)$', '')
 where key in ('modulo_serramenti_attivo', 'modulo_tetti_attivo', 'modulo_bagni_attivo')
   and description ~ '\(In arrivo\)$';

-- 3. La vista unificata senza le copie di firma dei moduli --------------------------------
-- Si cambia solo la condizione del ramo dei preventivi classici, presa dal database:
-- se il testo non è quello atteso la migrazione si ferma invece di riscrivere la vista.
do $$
declare
  v_def text := rtrim(pg_get_viewdef('public.v_preventivi_unificati'::regclass, true), E'; \n');
  v_vecchio constant text := E'FROM quotes q\n  WHERE q.deleted_at IS NULL\n';
  v_nuovo constant text := E'FROM quotes q\n  WHERE q.deleted_at IS NULL AND (q.source IS NULL OR q.source NOT LIKE \'modulo:%\')\n';
  v_volte int;
begin
  if position('modulo:' in v_def) > 0 then
    return; -- già fatto
  end if;
  v_volte := (length(v_def) - length(replace(v_def, v_vecchio, ''))) / length(v_vecchio);
  if v_volte <> 1 then
    raise exception 'v_preventivi_unificati: il ramo dei preventivi classici non è quello atteso (% occorrenze)', v_volte;
  end if;
  execute 'create or replace view public.v_preventivi_unificati with (security_invoker = true) as '
       || replace(v_def, v_vecchio, v_nuovo);
end;
$$;

-- 4. Se qualcosa non torna, la migrazione si ferma -----------------------------------------
do $$
begin
  if not exists (select 1 from public.platform_feature_flags where key = 'modulo_ristrutturazione_attivo') then
    raise exception 'Manca il permesso modulo_ristrutturazione_attivo';
  end if;
  if (select count(*) from public.company_feature_overrides where feature_key = 'modulo_ristrutturazione_attivo')
     <> (select count(*) from public.company_feature_overrides where feature_key = 'modulo_bagni_attivo') then
    raise exception 'Le aziende sbloccate su Ristrutturazione non sono quelle di Bagni';
  end if;
  if position('modulo:' in pg_get_viewdef('public.v_preventivi_unificati'::regclass, true)) = 0 then
    raise exception 'v_preventivi_unificati conta ancora le copie di firma dei moduli';
  end if;
end;
$$;
