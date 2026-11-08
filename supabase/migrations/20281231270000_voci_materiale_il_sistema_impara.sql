-- Il sistema impara da quello che fa ogni azienda (08/11/2026).
-- Quando si crea una commessa si vede quali voci l'azienda ha scelto di comprare: la volta dopo la
-- stessa voce parte già così. Prima di tutto contano i fatti: la scelta dell'azienda, poi l'articolo
-- collegato nel listino, poi il testo della voce. Nessuna riga esistente viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.voci_materiale_scelte (
  company_id uuid not null references public.companies(id) on delete cascade,
  chiave text not null,
  si_compra boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (company_id, chiave)
);
comment on table public.voci_materiale_scelte is 'Per ogni azienda: una voce di computo si compra o è solo lavoro. La scrive la creazione della commessa.';
alter table public.voci_materiale_scelte enable row level security;
revoke all on table public.voci_materiale_scelte from public, anon, authenticated;

create or replace function public.voce_chiave(p_descrizione text)
returns text language sql immutable set search_path to 'public' as $$
  select lower(regexp_replace(btrim(coalesce(p_descrizione, '')), '\s+', ' ', 'g'))
$$;
revoke all on function public.voce_chiave(text) from public, anon;
grant execute on function public.voce_chiave(text) to authenticated, service_role;

do $migrazione$
declare
  def text;
  pezzo text;
begin
  def := pg_get_functiondef('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])'::regprocedure);
  if position('voci_materiale_scelte' in def) = 0 then
    pezzo := 'definitivo uuid; stato_misura text;';
    if position(pezzo in def) = 0 then raise exception 'dichiarazioni non trovate'; end if;
    def := replace(def, pezzo, 'ricordate jsonb := ''{}''; articoli jsonb := ''{}''; chiave_voce text; ' || pezzo);

    pezzo := E'    origine := case when chiave = ''rst'' then ''computo_rst'' else ''computo_modulo'' end;';
    if position(pezzo in def) = 0 then raise exception 'origine non trovata'; end if;
    def := replace(def, pezzo, E'    select coalesce(jsonb_object_agg(s.chiave, s.si_compra), ''{}'') into ricordate
      from public.voci_materiale_scelte s where s.company_id = azienda;
    execute format(''select coalesce(jsonb_object_agg(l.id, true), ''''{}'''') from public.%I l
                     where l.company_id = $1 and l.articolo_id is not null
                       and l.id in (select nullif(x->>''''listino_voce_id'''', '''''''')::uuid from jsonb_array_elements($2) x)'',
                   prefisso || ''_listino_voci'')
      into articoli using azienda, voci;
' || pezzo);

    pezzo := E'proposta := public.voce_si_compra(r->>''descrizione'', (r->>''costo_materiali'')::numeric, r->>''marca'', r->>''modello'', r->>''famiglia_id'');';
    if position(pezzo in def) = 0 then raise exception 'proposta non trovata'; end if;
    def := replace(def, pezzo, E'chiave_voce := public.voce_chiave(r->>''descrizione'');
      proposta := coalesce((ricordate->>chiave_voce)::boolean, (articoli->>(r->>''listino_voce_id''))::boolean,
        public.voce_si_compra(r->>''descrizione'', (r->>''costo_materiali'')::numeric, r->>''marca'', r->>''modello'', r->>''famiglia_id''));');

    pezzo := E'''proposta'', proposta));';
    if position(pezzo in def) = 0 then raise exception 'voci_scelte non trovate'; end if;
    def := replace(def, pezzo, E'''proposta'', proposta, ''chiave'', chiave_voce));');

    pezzo := E'  update public.orders set created_by=auth.uid(),';
    if position(pezzo in def) = 0 then raise exception 'testata non trovata'; end if;
    def := replace(def, pezzo, E'  if p_voci_materiale is not null then
    insert into public.voci_materiale_scelte (company_id, chiave, si_compra, updated_by)
    select distinct on (x->>''chiave'') azienda, x->>''chiave'', (x->>''id'')::uuid = any(p_voci_materiale), auth.uid()
      from jsonb_array_elements(voci_scelte) x where coalesce(x->>''chiave'', '''') <> ''''
    on conflict (company_id, chiave) do update
      set si_compra = excluded.si_compra, updated_at = now(), updated_by = excluded.updated_by;
  end if;
' || pezzo);
    execute def;
  end if;
end $migrazione$;
