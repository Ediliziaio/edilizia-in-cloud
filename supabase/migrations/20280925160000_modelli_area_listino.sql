-- ════════════════════════════════════════════════════════════════════════════
-- Modelli di area del listino (25/09/2026)
-- ────────────────────────────────────────────────────────────────────────────
-- Florin: «domani entra un'azienda che fa fotovoltaico e usa gli stessi
-- prodotti di un'altra: io ho già tutto impostato, senza dover riscrivere
-- tutto. Ogni azienda ha i suoi prodotti che può modificare, ma alla base
-- posso avere dei modelli».
--
-- Prima: «+ Area» creava solo le tipologie vuote; la libreria del super admin
-- aveva 48 modelli di singoli prodotti (solo serramenti); copiare una
-- tipologia si poteva solo dentro la stessa azienda, e mai nel fotovoltaico.
--
-- Ora:
--   - listino_modelli_area: la FOTOGRAFIA di un'area (tipologie, campi, linee,
--     schede linea, prodotti con foto, schede tecniche, varianti, griglie,
--     documenti) presa dal listino di un'azienda. Se l'azienda poi cambia i
--     suoi prodotti il modello resta com'è; «Aggiorna dall'azienda» la rifà.
--   - Non entra MAI nella fotografia quello che è dell'azienda di origine e
--     non di un'altra: prezzi e sconti d'acquisto, ricarichi, fornitori,
--     tariffe di posa, magazzino, i dati dei campi che non sono campi della
--     tipologia (gli import ci lasciano regole di prezzo), i prodotti spenti.
--   - I prezzi di vendita entrano solo se il modello li vuole
--     (con_prezzi_vendita, scelto da Florin modello per modello). Senza, le
--     maggiorazioni in percentuale delle varianti restano (non sono prezzi) e
--     quelle a cifra fissa vanno a zero; i prodotti arrivano a 0 € e fuori dai
--     preventivi finché l'azienda non mette il suo prezzo.
--   - Installare crea tipologie, linee e prodotti DELL'AZIENDA, senza legame
--     col modello. Tipologie e linee con lo stesso nome si riusano, i prodotti
--     già presenti si saltano: si può ripetere senza doppioni. Il fotovoltaico
--     resta collegato al configuratore (trigger trg_fv_sync_family).
--   - Chi: il super admin crea, aggiorna, pubblica e installa ovunque;
--     l'amministratore dell'azienda installa nella sua i modelli pubblicati.
--     La tabella la legge solo il super admin: le aziende passano dalle
--     funzioni, e non vedono da quale azienda è nato un modello.
--
-- Solo tabelle nuove e funzioni: istantanea.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- ── 1. I modelli ─────────────────────────────────────────────────────────────
create table if not exists public.listino_modelli_area (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descrizione text,
  -- La chiave dell'area (areeStandard.ts): serramenti, fotovoltaico, bagni…
  area text not null,
  immagine_url text,
  pubblicato boolean not null default false,
  con_prezzi_vendita boolean not null default false,
  -- Da dove è nato (senza FK: se l'azienda sparisce, il modello resta).
  origine_company_id uuid,
  origine_nome text,
  origine_tipologie uuid[] not null default '{}',
  contenuto jsonb not null default '{"versione": 1, "tipologie": []}'::jsonb,
  riepilogo jsonb not null default '{}'::jsonb,
  fotografato_il timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint listino_modelli_area_nome_scritto check (btrim(nome) <> ''),
  constraint listino_modelli_area_area_scritta check (btrim(area) <> '')
);

comment on table public.listino_modelli_area is
  'Modelli di area del listino: la fotografia di tipologie, linee e prodotti di un''azienda, da installare in altre aziende come copia loro. Solo super admin; le aziende passano da listino_modelli_disponibili / listino_modello_installa.';

create unique index if not exists listino_modelli_area_nome_unico
  on public.listino_modelli_area (lower(btrim(nome)));

alter table public.listino_modelli_area enable row level security;

drop policy if exists listino_modelli_area_super_admin on public.listino_modelli_area;
create policy listino_modelli_area_super_admin on public.listino_modelli_area
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

revoke all on public.listino_modelli_area from anon;

drop trigger if exists trg_listino_modelli_area_updated_at on public.listino_modelli_area;
create trigger trg_listino_modelli_area_updated_at
  before update on public.listino_modelli_area
  for each row execute function public.update_updated_at_column();

-- ── 2. Dove è stato installato ───────────────────────────────────────────────
create table if not exists public.listino_modelli_installazioni (
  id uuid primary key default gen_random_uuid(),
  modello_id uuid not null references public.listino_modelli_area(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  installato_il timestamptz not null default now(),
  installato_da uuid,
  esito jsonb not null default '{}'::jsonb
);

create index if not exists idx_listino_modelli_installazioni_modello
  on public.listino_modelli_installazioni (modello_id, installato_il desc);
create index if not exists idx_listino_modelli_installazioni_azienda
  on public.listino_modelli_installazioni (company_id);

comment on table public.listino_modelli_installazioni is
  'Registro delle installazioni dei modelli di area: quale modello, in quale azienda, quando, cosa ha creato.';

alter table public.listino_modelli_installazioni enable row level security;

drop policy if exists listino_modelli_installazioni_super_admin on public.listino_modelli_installazioni;
create policy listino_modelli_installazioni_super_admin on public.listino_modelli_installazioni
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

revoke all on public.listino_modelli_installazioni from anon;

-- ── 3. Il prezzo di vendita che l'azienda di origine vede ────────────────────
-- Con «acquisto + ricarico» la vendita si ricava dall'acquisto (come
-- useFamilyPricing e venditaOAcquisto in lib/serramenti/pricing.ts): lordo,
-- due sconti fornitore in cascata, poi il ricarico. Nel modello va la vendita,
-- mai l'acquisto.
create or replace function public.listino_vendita_effettiva(
  p_vendita numeric,
  p_acquisto numeric,
  p_modo text,
  p_sconto1 numeric,
  p_sconto2 numeric,
  p_markup_tipo text,
  p_markup_valore numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_modo = 'acquisto_markup' and coalesce(p_acquisto, 0) > 0 then
      round(
        p_acquisto
          * (1 - least(greatest(coalesce(p_sconto1, 0), 0), 100) / 100)
          * (1 - least(greatest(coalesce(p_sconto2, 0), 0), 100) / 100)
          * case when p_markup_tipo = 'percentuale' then 1 + greatest(coalesce(p_markup_valore, 0), 0) / 100 else 1 end
          + case when p_markup_tipo = 'fisso_pz' then greatest(coalesce(p_markup_valore, 0), 0) else 0 end,
        2)
    else p_vendita
  end
$$;

revoke all on function public.listino_vendita_effettiva(numeric, numeric, text, numeric, numeric, text, numeric)
  from public, anon, authenticated;

-- ── 4. La fotografia di un'area ──────────────────────────────────────────────
-- Uso interno: la chiamano listino_modello_crea e listino_modello_aggiorna.
create or replace function public.listino_modello_fotografia(
  p_company_id uuid,
  p_tipologie uuid[],
  p_con_prezzi boolean
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'versione', 1,
    'tipologie', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'chiave', m.id,
          'nome', m.nome,
          'descrizione', m.descrizione,
          'icona', m.icona,
          'colore', m.colore,
          'sort_order', m.sort_order,
          'attivo', m.attivo,
          'verticali_abilitati', to_jsonb(coalesce(m.verticali_abilitati, '{}'::text[])),
          'immagine_url', m.immagine_url,
          'descrizione_estesa', m.descrizione_estesa,
          'mostra_pagina_dedicata_pdf', m.mostra_pagina_dedicata_pdf,
          'categoria_tipo', m.categoria_tipo,
          'tipologia', m.tipologia,
          'fv_categoria', m.fv_categoria,
          'campi', coalesce((
            select jsonb_agg(
              to_jsonb(fd) - 'id' - 'macrocategoria_id' - 'created_at' - 'updated_at'
              order by fd.sort_order, fd.field_key)
              from public.listino_macrocategoria_fields fd
             where fd.macrocategoria_id = m.id), '[]'::jsonb),
          'linee', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'chiave', c.id,
                'nome', c.nome,
                'colore', c.colore,
                'icona', c.icona,
                'margine_target_percentuale', case when p_con_prezzi then c.margine_target_percentuale end,
                'sort_order', c.sort_order,
                'descrizione', c.descrizione,
                'immagine_url', c.immagine_url)
              order by c.sort_order, c.nome)
              from public.listino_categorie c
             where c.macrocategoria_id = m.id), '[]'::jsonb),
          'schede_linea', coalesce((
            select jsonb_agg(
              to_jsonb(s) - 'id' - 'company_id' - 'macrocategoria_id' - 'created_at' - 'updated_at'
              order by s.chiave)
              from public.listino_schede_linea s
             where s.macrocategoria_id = m.id), '[]'::jsonb),
          'prodotti', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'chiave', f.id,
                'linea', f.categoria_id,
                'vertical', f.vertical,
                'nome', f.nome,
                'descrizione', f.descrizione,
                'immagine_url', f.immagine_url,
                'pdf_scheda_url', f.pdf_scheda_url,
                'modalita_prezzo_base', f.modalita_prezzo_base,
                'prezzo_base_vendita', case when p_con_prezzi then public.listino_vendita_effettiva(
                    f.prezzo_base_vendita, f.prezzo_base_acquisto, f.prezzo_base_mode,
                    f.sconto_fornitore_1, f.sconto_fornitore_2, f.markup_tipo, f.markup_valore) end,
                'vat_rate', f.vat_rate,
                'unit_of_measure', f.unit_of_measure,
                'griglia_asse_x_label', f.griglia_asse_x_label,
                'griglia_asse_y_label', f.griglia_asse_y_label,
                'griglia_unita', f.griglia_unita,
                'sort_order', f.sort_order,
                -- Solo i campi della tipologia: gli import ci lasciano altro
                -- (file di origine, regole di prezzo dell'azienda).
                'campi', coalesce((
                  select jsonb_object_agg(e.key, e.value)
                    from jsonb_each(coalesce(f.custom_field_values, '{}'::jsonb)) e
                   where e.key in (select fd.field_key from public.listino_macrocategoria_fields fd
                                    where fd.macrocategoria_id = m.id)), '{}'::jsonb),
                'manodopera_modalita', f.manodopera_modalita,
                'manodopera_unita', f.manodopera_unita,
                'manodopera_prezzo_vendita', case when p_con_prezzi then f.manodopera_prezzo_vendita end,
                'codice', f.codice,
                'mostra_preventivo', f.mostra_preventivo,
                'assi', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'nome', a.nome,
                      'codice', a.codice,
                      'descrizione', a.descrizione,
                      'tipo', a.tipo,
                      'obbligatorio', a.obbligatorio,
                      'sort_order', a.sort_order,
                      'valori', coalesce((
                        select jsonb_agg(
                          jsonb_build_object(
                            'chiave', v.id,
                            'valore', v.valore,
                            'label', v.label,
                            'descrizione', v.descrizione,
                            'is_default', v.is_default,
                            'maggiorazione_tipo', v.maggiorazione_tipo,
                            'maggiorazione_valore', case
                              when p_con_prezzi or v.maggiorazione_tipo = 'percentuale' then v.maggiorazione_valore
                              else 0 end,
                            'sort_order', v.sort_order,
                            'attivo', v.attivo,
                            'codice', v.codice,
                            'prezzo_vendita', case when p_con_prezzi then v.prezzo_vendita end,
                            'immagine_url', v.immagine_url,
                            'opzioni', v.opzioni)
                          order by v.sort_order, v.valore)
                          from public.article_family_axis_values v
                         where v.axis_id = a.id), '[]'::jsonb))
                    order by a.sort_order, a.codice)
                    from public.article_family_axes a
                   where a.family_id = f.id), '[]'::jsonb),
                -- Una cella per misura: le righe per linea fornitore sono
                -- dell'azienda di origine (listino del suo fornitore).
                'griglia', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'axis_config', g.axis_config,
                      'x', g.valore_x,
                      'y', g.valore_y,
                      'pv', case when p_con_prezzi then public.listino_vendita_effettiva(
                          g.prezzo_vendita, g.prezzo_acquisto, f.prezzo_base_mode,
                          f.sconto_fornitore_1, f.sconto_fornitore_2, f.markup_tipo, f.markup_valore) end,
                      'note', g.note)
                    order by g.valore_x, g.valore_y)
                    from (
                      select distinct on (coalesce(lg.axis_config, '{}'::jsonb), lg.valore_x, lg.valore_y) lg.*
                        from public.listino_griglia lg
                       where lg.family_id = f.id
                       order by coalesce(lg.axis_config, '{}'::jsonb), lg.valore_x, lg.valore_y,
                                (lg.supplier_product_line_id is not null), lg.id
                    ) g), '[]'::jsonb),
                'documenti', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'nome', d.nome,
                      'url', d.url,
                      'tipo', d.tipo,
                      'file_size', d.file_size,
                      'valore', d.axis_value_id)
                    order by d.created_at)
                    from public.article_family_documents d
                   where d.family_id = f.id), '[]'::jsonb))
              order by f.sort_order nulls last, f.nome)
              from public.article_families f
             where f.macrocategoria_id = m.id
               and f.company_id = p_company_id
               and f.deleted_at is null
               and f.attivo), '[]'::jsonb))
        order by m.sort_order nulls last, m.nome)
        from public.listino_macrocategorie m
       where m.company_id = p_company_id
         and m.id = any (p_tipologie)), '[]'::jsonb))
$$;

revoke all on function public.listino_modello_fotografia(uuid, uuid[], boolean) from public, anon, authenticated;

-- ── 5. Il riepilogo che si mostra nelle schede ───────────────────────────────
create or replace function public.listino_modello_riepilogo(p_contenuto jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with t as (
    select value as tip from jsonb_array_elements(coalesce(p_contenuto -> 'tipologie', '[]'::jsonb))
  ), p as (
    select value as prod from t, jsonb_array_elements(coalesce(t.tip -> 'prodotti', '[]'::jsonb))
  )
  select jsonb_build_object(
    'tipologie', (select count(*) from t),
    'linee', (select coalesce(sum(jsonb_array_length(coalesce(tip -> 'linee', '[]'::jsonb))), 0) from t),
    'schede_linea', (select coalesce(sum(jsonb_array_length(coalesce(tip -> 'schede_linea', '[]'::jsonb))), 0) from t),
    'prodotti', (select count(*) from p),
    'con_foto', (select count(*) from p where nullif(prod ->> 'immagine_url', '') is not null),
    'con_scheda', (select count(*) from p
                    where nullif(prod ->> 'pdf_scheda_url', '') is not null
                       or jsonb_array_length(coalesce(prod -> 'documenti', '[]'::jsonb)) > 0),
    'varianti', (select count(*) from p,
                   jsonb_array_elements(coalesce(prod -> 'assi', '[]'::jsonb)) a,
                   jsonb_array_elements(coalesce(a.value -> 'valori', '[]'::jsonb)) v),
    'celle_griglia', (select coalesce(sum(jsonb_array_length(coalesce(prod -> 'griglia', '[]'::jsonb))), 0) from p),
    'fotovoltaico', exists (select 1 from t where nullif(tip ->> 'fv_categoria', '') is not null),
    'nomi_tipologie', (select coalesce(jsonb_agg(tip ->> 'nome'), '[]'::jsonb) from t),
    'copertina', (select prod ->> 'immagine_url' from p
                   where nullif(prod ->> 'immagine_url', '') is not null limit 1)
  )
$$;

revoke all on function public.listino_modello_riepilogo(jsonb) from public, anon, authenticated;

-- ── 6. Creare un modello (super admin) ───────────────────────────────────────
create or replace function public.listino_modello_crea(
  p_company_id uuid,
  p_tipologie uuid[],
  p_area text,
  p_nome text,
  p_descrizione text default null,
  p_con_prezzi boolean default false,
  p_pubblicato boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tipologie uuid[] := array(select distinct x from unnest(coalesce(p_tipologie, '{}'::uuid[])) x where x is not null);
  v_trovate int;
  v_contenuto jsonb;
  v_riepilogo jsonb;
  v_origine text;
  v_id uuid;
begin
  if v_uid is null or not public.has_role(v_uid, 'super_admin'::public.app_role) then
    raise exception 'Solo il super admin crea i modelli di area' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Scrivi il nome del modello' using errcode = '22023';
  end if;
  if btrim(coalesce(p_area, '')) = '' then
    raise exception 'Scegli l''area del modello' using errcode = '22023';
  end if;
  select name into v_origine from public.companies where id = p_company_id;
  if not found then
    raise exception 'Azienda non trovata' using errcode = 'P0002';
  end if;
  if cardinality(v_tipologie) = 0 then
    raise exception 'Scegli almeno una tipologia' using errcode = '22023';
  end if;
  select count(*) into v_trovate
    from public.listino_macrocategorie
   where company_id = p_company_id and id = any (v_tipologie);
  if v_trovate <> cardinality(v_tipologie) then
    raise exception 'Alcune tipologie non sono di quest''azienda' using errcode = '22023';
  end if;
  if exists (select 1 from public.listino_modelli_area where lower(btrim(nome)) = lower(btrim(p_nome))) then
    raise exception 'Esiste già un modello «%»: scegli un altro nome', btrim(p_nome) using errcode = '23505';
  end if;

  v_contenuto := public.listino_modello_fotografia(p_company_id, v_tipologie, coalesce(p_con_prezzi, false));
  v_riepilogo := public.listino_modello_riepilogo(v_contenuto);
  if coalesce((v_riepilogo ->> 'prodotti')::int, 0) = 0 then
    raise exception 'Le tipologie scelte non hanno prodotti attivi: il modello sarebbe vuoto' using errcode = '22023';
  end if;

  insert into public.listino_modelli_area
    (nome, descrizione, area, immagine_url, pubblicato, con_prezzi_vendita, origine_company_id, origine_nome,
     origine_tipologie, contenuto, riepilogo, fotografato_il, created_by, updated_by)
  values
    (btrim(p_nome), nullif(btrim(coalesce(p_descrizione, '')), ''), btrim(p_area), v_riepilogo ->> 'copertina',
     coalesce(p_pubblicato, false), coalesce(p_con_prezzi, false), p_company_id, v_origine,
     v_tipologie, v_contenuto, v_riepilogo, now(), v_uid, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.listino_modello_crea(uuid, uuid[], text, text, text, boolean, boolean) from public, anon;
grant execute on function public.listino_modello_crea(uuid, uuid[], text, text, text, boolean, boolean) to authenticated;

-- ── 7. Rifare la fotografia dall'azienda di origine (super admin) ────────────
create or replace function public.listino_modello_aggiorna(p_modello_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mod public.listino_modelli_area%rowtype;
  v_tipologie uuid[];
  v_contenuto jsonb;
  v_riepilogo jsonb;
begin
  if v_uid is null or not public.has_role(v_uid, 'super_admin'::public.app_role) then
    raise exception 'Solo il super admin aggiorna i modelli di area' using errcode = '42501';
  end if;
  select * into v_mod from public.listino_modelli_area where id = p_modello_id for update;
  if not found then
    raise exception 'Modello non trovato' using errcode = 'P0002';
  end if;
  if v_mod.origine_company_id is null
     or not exists (select 1 from public.companies where id = v_mod.origine_company_id) then
    raise exception 'L''azienda da cui è nato il modello non c''è più: il modello resta com''è' using errcode = 'P0002';
  end if;
  v_tipologie := array(
    select id from public.listino_macrocategorie
     where company_id = v_mod.origine_company_id and id = any (v_mod.origine_tipologie));
  if cardinality(v_tipologie) = 0 then
    raise exception 'Le tipologie da cui è nato il modello non ci sono più: il modello resta com''è' using errcode = 'P0002';
  end if;

  v_contenuto := public.listino_modello_fotografia(v_mod.origine_company_id, v_tipologie, v_mod.con_prezzi_vendita);
  v_riepilogo := public.listino_modello_riepilogo(v_contenuto);

  update public.listino_modelli_area
     set contenuto = v_contenuto,
         riepilogo = v_riepilogo,
         origine_tipologie = v_tipologie,
         origine_nome = (select name from public.companies where id = v_mod.origine_company_id),
         immagine_url = coalesce(immagine_url, v_riepilogo ->> 'copertina'),
         fotografato_il = now(),
         updated_by = v_uid
   where id = p_modello_id;

  return v_riepilogo;
end;
$$;

revoke all on function public.listino_modello_aggiorna(uuid) from public, anon;
grant execute on function public.listino_modello_aggiorna(uuid) to authenticated;

-- ── 8. I modelli che un'azienda può installare ───────────────────────────────
-- Senza il contenuto (pesante, e con i prezzi di vendita se il modello li ha)
-- e senza l'azienda di origine.
create or replace function public.listino_modelli_disponibili()
returns table (
  id uuid,
  nome text,
  descrizione text,
  area text,
  immagine_url text,
  con_prezzi_vendita boolean,
  riepilogo jsonb,
  fotografato_il timestamptz,
  installato_il timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome, m.descrizione, m.area, m.immagine_url, m.con_prezzi_vendita,
         m.riepilogo, m.fotografato_il,
         (select max(i.installato_il) from public.listino_modelli_installazioni i
           where i.modello_id = m.id and i.company_id = public.get_my_company_id())
    from public.listino_modelli_area m
   where m.pubblicato
     and (select auth.uid()) is not null
     and not public.utente_bloccato()
   order by m.area, m.nome
$$;

revoke all on function public.listino_modelli_disponibili() from public, anon;
grant execute on function public.listino_modelli_disponibili() to authenticated;

-- ── 9. Installare un modello in un'azienda ───────────────────────────────────
create or replace function public.listino_modello_installa(p_modello_id uuid, p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set lock_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid();
  v_super boolean;
  v_mod public.listino_modelli_area%rowtype;
  v_t jsonb;
  v_l jsonb;
  v_p jsonb;
  v_a jsonb;
  v_macro uuid;
  v_cat uuid;
  v_fam uuid;
  v_ax uuid;
  v_mappa_linee jsonb;
  v_mappa_valori jsonb;
  v_mappa_asse jsonb;
  v_verticali text[];
  v_n int;
  v_tip_nuove int := 0;
  v_tip_esistenti int := 0;
  v_linee_nuove int := 0;
  v_schede int := 0;
  v_prod_nuovi int := 0;
  v_prod_presenti int := 0;
  v_varianti int := 0;
  v_celle int := 0;
  v_documenti int := 0;
  v_esito jsonb;
begin
  if v_uid is null then
    raise exception 'Accesso non autorizzato' using errcode = '42501';
  end if;
  v_super := public.has_role(v_uid, 'super_admin'::public.app_role);

  select * into v_mod from public.listino_modelli_area where id = p_modello_id;
  if not found or (not v_super and not v_mod.pubblicato) then
    raise exception 'Modello non disponibile' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Azienda non trovata' using errcode = 'P0002';
  end if;
  -- Come la regola che lascia creare le tipologie (listino_copia_tipologia):
  -- l'amministratore dell'azienda, anche da accesso multi-azienda, o il super admin.
  if not v_super and (
       public.utente_bloccato()
       or not (
         (public.has_role(v_uid, 'company_admin'::public.app_role)
          and public.get_user_company_id(v_uid) = p_company_id)
         or exists (
           select 1 from public.multi_company_access mca
            where mca.user_id = v_uid
              and mca.company_id = p_company_id
              and mca.status = 'active'
              and (mca.expires_at is null or mca.expires_at > now())
              and mca.access_role::text = 'company_admin'))) then
    raise exception 'Solo l''amministratore dell''azienda può aggiungere un''area da un modello' using errcode = '42501';
  end if;

  for v_t in select value from jsonb_array_elements(coalesce(v_mod.contenuto -> 'tipologie', '[]'::jsonb)) loop
    v_verticali := array(select jsonb_array_elements_text(coalesce(v_t -> 'verticali_abilitati', '[]'::jsonb)));

    -- La tipologia: quella con lo stesso nome se l'azienda ce l'ha già.
    select id into v_macro
      from public.listino_macrocategorie
     where company_id = p_company_id and lower(btrim(nome)) = lower(btrim(v_t ->> 'nome'))
     limit 1;
    if v_macro is null then
      insert into public.listino_macrocategorie
        (company_id, nome, descrizione, icona, colore, sort_order, attivo, verticali_abilitati,
         immagine_url, descrizione_estesa, mostra_pagina_dedicata_pdf, categoria_tipo, tipologia, fv_categoria)
      values
        (p_company_id, btrim(v_t ->> 'nome'), v_t ->> 'descrizione', v_t ->> 'icona', v_t ->> 'colore',
         coalesce((v_t ->> 'sort_order')::int, 0), coalesce((v_t ->> 'attivo')::boolean, true), v_verticali,
         v_t ->> 'immagine_url', v_t ->> 'descrizione_estesa',
         coalesce((v_t ->> 'mostra_pagina_dedicata_pdf')::boolean, false),
         coalesce(v_t ->> 'categoria_tipo', 'principale'), v_t ->> 'tipologia', v_t ->> 'fv_categoria')
      returning id into v_macro;
      v_tip_nuove := v_tip_nuove + 1;
    else
      -- Si riempiono solo i buchi: il collegamento al preventivatore e al
      -- configuratore fotovoltaico, se la tipologia dell'azienda non l'ha.
      update public.listino_macrocategorie
         set verticali_abilitati = case when coalesce(cardinality(verticali_abilitati), 0) = 0
                                        then v_verticali else verticali_abilitati end,
             tipologia = coalesce(tipologia, v_t ->> 'tipologia'),
             fv_categoria = coalesce(fv_categoria, v_t ->> 'fv_categoria')
       where id = v_macro
         and ((coalesce(cardinality(verticali_abilitati), 0) = 0 and cardinality(v_verticali) > 0)
              or (tipologia is null and v_t ->> 'tipologia' is not null)
              or (fv_categoria is null and v_t ->> 'fv_categoria' is not null));
      v_tip_esistenti := v_tip_esistenti + 1;
    end if;

    insert into public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, field_placeholder,
       field_help, required, show_in_picker, show_in_pdf, sort_order)
    select v_macro, c ->> 'field_key', coalesce(c ->> 'field_label', c ->> 'field_key'),
           coalesce(c ->> 'field_type', 'text'), c ->> 'field_unit',
           case when jsonb_typeof(c -> 'field_options') = 'null' then null else c -> 'field_options' end,
           c ->> 'field_placeholder', c ->> 'field_help',
           coalesce((c ->> 'required')::boolean, false), coalesce((c ->> 'show_in_picker')::boolean, true),
           coalesce((c ->> 'show_in_pdf')::boolean, true), coalesce((c ->> 'sort_order')::int, 0)
      from jsonb_array_elements(coalesce(v_t -> 'campi', '[]'::jsonb)) c
     where nullif(c ->> 'field_key', '') is not null
    on conflict (macrocategoria_id, field_key) do nothing;

    -- Le linee: quelle con lo stesso nome dentro la tipologia si riusano.
    v_mappa_linee := '{}'::jsonb;
    for v_l in select value from jsonb_array_elements(coalesce(v_t -> 'linee', '[]'::jsonb)) loop
      select id into v_cat
        from public.listino_categorie
       where company_id = p_company_id and macrocategoria_id = v_macro
         and lower(btrim(nome)) = lower(btrim(v_l ->> 'nome'))
       limit 1;
      if v_cat is null then
        insert into public.listino_categorie
          (company_id, nome, colore, icona, margine_target_percentuale, sort_order, macrocategoria_id,
           descrizione, immagine_url)
        values
          (p_company_id, btrim(v_l ->> 'nome'), v_l ->> 'colore', v_l ->> 'icona',
           (v_l ->> 'margine_target_percentuale')::numeric, coalesce((v_l ->> 'sort_order')::int, 0), v_macro,
           v_l ->> 'descrizione', v_l ->> 'immagine_url')
        returning id into v_cat;
        v_linee_nuove := v_linee_nuove + 1;
      end if;
      v_mappa_linee := v_mappa_linee || jsonb_build_object(v_l ->> 'chiave', v_cat);
    end loop;

    insert into public.listino_schede_linea
      (company_id, macrocategoria_id, chiave, nome, descrizione, immagine_url, profondita_mm, camere,
       guarnizioni, uw, scheda_tecnica_url, scheda_tecnica_nome)
    select p_company_id, v_macro, s ->> 'chiave', s ->> 'nome', s ->> 'descrizione', s ->> 'immagine_url',
           (s ->> 'profondita_mm')::int, (s ->> 'camere')::smallint, (s ->> 'guarnizioni')::smallint,
           (s ->> 'uw')::numeric, s ->> 'scheda_tecnica_url', s ->> 'scheda_tecnica_nome'
      from jsonb_array_elements(coalesce(v_t -> 'schede_linea', '[]'::jsonb)) s
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_schede := v_schede + v_n;

    -- I prodotti: uno già presente con lo stesso nome, nella stessa linea, si salta.
    for v_p in select value from jsonb_array_elements(coalesce(v_t -> 'prodotti', '[]'::jsonb)) loop
      v_cat := case when v_p ->> 'linea' is null then null else (v_mappa_linee ->> (v_p ->> 'linea'))::uuid end;
      if exists (
        select 1 from public.article_families g
         where g.company_id = p_company_id
           and g.vertical = v_p ->> 'vertical'
           and g.nome = v_p ->> 'nome'
           and g.attivo and g.deleted_at is null
           and g.categoria_id is not distinct from v_cat) then
        v_prod_presenti := v_prod_presenti + 1;
        continue;
      end if;

      insert into public.article_families
        (company_id, vertical, categoria_id, nome, descrizione, immagine_url, pdf_scheda_url,
         modalita_prezzo_base, prezzo_base_vendita, prezzo_base_acquisto, vat_rate, unit_of_measure,
         griglia_asse_x_label, griglia_asse_y_label, griglia_unita, attivo, sort_order, custom_field_values,
         posa_linked, prezzo_base_mode, markup_tipo, markup_valore, manodopera_modalita,
         manodopera_prezzo_vendita, manodopera_unita, macrocategoria_id, codice, mostra_preventivo)
      values
        (p_company_id, v_p ->> 'vertical', v_cat, v_p ->> 'nome', v_p ->> 'descrizione',
         v_p ->> 'immagine_url', v_p ->> 'pdf_scheda_url',
         coalesce(v_p ->> 'modalita_prezzo_base', 'pz'),
         coalesce((v_p ->> 'prezzo_base_vendita')::numeric, 0), null,
         coalesce((v_p ->> 'vat_rate')::numeric, 22), coalesce(v_p ->> 'unit_of_measure', 'pz'),
         v_p ->> 'griglia_asse_x_label', v_p ->> 'griglia_asse_y_label', v_p ->> 'griglia_unita',
         true, (v_p ->> 'sort_order')::int, coalesce(v_p -> 'campi', '{}'::jsonb),
         false, 'vendita', 'none', 0, coalesce(v_p ->> 'manodopera_modalita', 'nessuna'),
         coalesce((v_p ->> 'manodopera_prezzo_vendita')::numeric, 0), coalesce(v_p ->> 'manodopera_unita', 'pz'),
         v_macro, v_p ->> 'codice',
         -- Senza i prezzi del modello il prodotto aspetta il prezzo dell'azienda
         -- fuori dai preventivi, come gli «Esempio» del listino.
         case when v_mod.con_prezzi_vendita then coalesce((v_p ->> 'mostra_preventivo')::boolean, true) else false end)
      returning id into v_fam;
      v_prod_nuovi := v_prod_nuovi + 1;

      v_mappa_valori := '{}'::jsonb;
      for v_a in select value from jsonb_array_elements(coalesce(v_p -> 'assi', '[]'::jsonb)) loop
        insert into public.article_family_axes
          (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
        values
          (v_fam, p_company_id, v_a ->> 'nome', v_a ->> 'codice', v_a ->> 'descrizione',
           coalesce(v_a ->> 'tipo', 'discrete'), coalesce((v_a ->> 'obbligatorio')::boolean, true),
           coalesce((v_a ->> 'sort_order')::int, 0))
        returning id into v_ax;

        with nuovi as (
          insert into public.article_family_axis_values
            (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
             maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, codice, prezzo_vendita,
             prezzo_acquisto, immagine_url, opzioni)
          select v_ax, p_company_id, v ->> 'valore', coalesce(v ->> 'label', v ->> 'valore'), v ->> 'descrizione',
                 coalesce((v ->> 'is_default')::boolean, false), coalesce(v ->> 'maggiorazione_tipo', 'none'),
                 coalesce((v ->> 'maggiorazione_valore')::numeric, 0), 0,
                 coalesce((v ->> 'sort_order')::int, 0), coalesce((v ->> 'attivo')::boolean, true),
                 v ->> 'codice', (v ->> 'prezzo_vendita')::numeric, null, v ->> 'immagine_url',
                 case when jsonb_typeof(v -> 'opzioni') in ('array', 'object') then v -> 'opzioni' else '[]'::jsonb end
            from jsonb_array_elements(coalesce(v_a -> 'valori', '[]'::jsonb)) v
          returning id, valore
        )
        select coalesce(jsonb_object_agg(v ->> 'chiave', n.id), '{}'::jsonb), count(*)
          into v_mappa_asse, v_n
          from jsonb_array_elements(coalesce(v_a -> 'valori', '[]'::jsonb)) v
          join nuovi n on n.valore = v ->> 'valore';
        v_mappa_valori := v_mappa_valori || v_mappa_asse;
        v_varianti := v_varianti + v_n;
      end loop;

      insert into public.listino_griglia
        (company_id, family_id, axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto, note)
      select p_company_id, v_fam,
             case when jsonb_typeof(g -> 'axis_config') = 'null' then null else g -> 'axis_config' end,
             -- Senza i prezzi del modello la griglia arriva con le misure e
             -- le caselle a zero, da riempire.
             (g ->> 'x')::int, (g ->> 'y')::int, coalesce((g ->> 'pv')::numeric, 0), null, g ->> 'note'
        from jsonb_array_elements(coalesce(v_p -> 'griglia', '[]'::jsonb)) g;
      get diagnostics v_n = row_count;
      v_celle := v_celle + v_n;

      insert into public.article_family_documents
        (company_id, family_id, nome, url, tipo, file_size, created_by, axis_value_id)
      select p_company_id, v_fam, d ->> 'nome', d ->> 'url', coalesce(d ->> 'tipo', 'scheda_tecnica'),
             (d ->> 'file_size')::int, v_uid,
             case when d ->> 'valore' is null then null else (v_mappa_valori ->> (d ->> 'valore'))::uuid end
        from jsonb_array_elements(coalesce(v_p -> 'documenti', '[]'::jsonb)) d
       where d ->> 'valore' is null or v_mappa_valori ? (d ->> 'valore');
      get diagnostics v_n = row_count;
      v_documenti := v_documenti + v_n;
    end loop;
  end loop;

  v_esito := jsonb_build_object(
    'modello', v_mod.nome,
    'area', v_mod.area,
    'tipologie_nuove', v_tip_nuove,
    'tipologie_gia_presenti', v_tip_esistenti,
    'linee_nuove', v_linee_nuove,
    'schede_linea', v_schede,
    'prodotti_nuovi', v_prod_nuovi,
    'prodotti_gia_presenti', v_prod_presenti,
    'varianti', v_varianti,
    'celle_griglia', v_celle,
    'documenti', v_documenti,
    'con_prezzi', v_mod.con_prezzi_vendita);

  insert into public.listino_modelli_installazioni (modello_id, company_id, installato_da, esito)
  values (p_modello_id, p_company_id, v_uid, v_esito);

  return v_esito;
end;
$$;

revoke all on function public.listino_modello_installa(uuid, uuid) from public, anon;
grant execute on function public.listino_modello_installa(uuid, uuid) to authenticated;
