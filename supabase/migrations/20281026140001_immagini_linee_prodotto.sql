-- CLI-generated migration, ordered after the repository's existing migrations.
-- No new table or policy: the existing tenant RLS also protects these columns.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create or replace function public.catalogo_immagini_valide(v jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $fn$
  select case when jsonb_typeof(v) is distinct from 'array' then false else
    jsonb_array_length(v) <= 12
    and not exists (select 1 from jsonb_array_elements(v) e where
      jsonb_typeof(e) is distinct from 'object'
      or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 100
      or jsonb_typeof(e->'url') is distinct from 'string' or (e->>'url') !~ '^(https?://|/[^/])'
      or coalesce(e->>'ruolo','') not in ('principale','sezione','dettaglio','esclusa')
      or jsonb_typeof(e->'didascalia') is distinct from 'string' or length(e->>'didascalia') > 240)
    and (select count(*) = count(distinct e->>'id') from jsonb_array_elements(v) e)
    and (select count(*) <= 1 from jsonb_array_elements(v) e where e->>'ruolo' = 'principale') end;
$fn$;
revoke all on function public.catalogo_immagini_valide(jsonb) from public, anon;
grant execute on function public.catalogo_immagini_valide(jsonb) to authenticated, service_role;

alter table public.listino_schede_linea add column if not exists immagini jsonb not null default '[]';
alter table public.supplier_product_lines add column if not exists immagini jsonb not null default '[]';
-- Earlier gallery patches created nullable columns. Preserve existing images;
-- only an absent gallery becomes the same empty array used by new records.
update public.listino_schede_linea set immagini = '[]'::jsonb where immagini is null;
update public.supplier_product_lines set immagini = '[]'::jsonb where immagini is null;
alter table public.listino_schede_linea alter column immagini set default '[]'::jsonb, alter column immagini set not null;
alter table public.supplier_product_lines alter column immagini set default '[]'::jsonb, alter column immagini set not null;
alter table public.listino_schede_linea add constraint listino_schede_linea_immagini_valide check (public.catalogo_immagini_valide(immagini));
alter table public.supplier_product_lines add constraint supplier_product_lines_immagini_valide check (public.catalogo_immagini_valide(immagini));

-- Preserve galleries through the existing catalogue-copy/install RPCs without
-- changing their authorization, locks, price calculations or privileges.
do $patch$
declare p record; originale text; nuovo text;
begin
  for p in select oid, proname from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('listino_copia_tipologia', 'listino_modello_installa_core', 'listino_modello_installa') loop
    originale := pg_get_functiondef(p.oid);
    if position('scheda_tecnica_url, scheda_tecnica_nome)' in originale) = 0 then continue; end if;
    nuovo := replace(originale, 'scheda_tecnica_url, scheda_tecnica_nome)', 'scheda_tecnica_url, scheda_tecnica_nome, immagini)');
    if p.proname = 'listino_copia_tipologia' then
      if position('s.scheda_tecnica_url, s.scheda_tecnica_nome' in nuovo) = 0 then raise exception 'Copia listino non riconosciuta: verificare la conservazione delle immagini'; end if;
      nuovo := replace(nuovo, 's.scheda_tecnica_url, s.scheda_tecnica_nome', 's.scheda_tecnica_url, s.scheda_tecnica_nome, s.immagini');
    else
      if position($old$s ->> 'scheda_tecnica_url', s ->> 'scheda_tecnica_nome'$old$ in nuovo) = 0 then raise exception 'Installazione modello non riconosciuta: verificare la conservazione delle immagini'; end if;
      nuovo := replace(nuovo, $old$s ->> 'scheda_tecnica_url', s ->> 'scheda_tecnica_nome'$old$, $new$s ->> 'scheda_tecnica_url', s ->> 'scheda_tecnica_nome', coalesce(s -> 'immagini', '[]'::jsonb)$new$);
    end if;
    execute nuovo;
  end loop;
end;
$patch$;
