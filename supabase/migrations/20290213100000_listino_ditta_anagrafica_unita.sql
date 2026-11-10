-- ============================================================================
-- Subappalto dal computo, lotto 1 (docs/piano-subappalto-computo-listino.md).
--
-- 1. Il listino della ditta si lega all'ANAGRAFICA del subappaltatore
--    (`subappaltatori`), non solo alla squadra (`external_teams`): Bonarrigo ha
--    71 subappaltatori e nessuna squadra, e contratto, fornitore e squadra
--    puntano tutti all'anagrafica.
--      · tariffa_costi_varianti.subappaltatore_id — il prezzo della ditta su una
--        voce del listino aziendale;
--      · tariffe_aziendali.subappaltatore_id — la voce che ha solo quella ditta.
--    Un trigger copia l'anagrafica dalla squadra quando c'è e rifiuta una
--    squadra di un'altra ditta o un subappaltatore di un'altra azienda. Se la
--    squadra viene collegata (o ricollegata) a un'anagrafica dopo, le sue righe
--    la seguono. Le righe di oggi (66, tutte di Demo 2) la prendono dalla squadra.
--
-- 2. `unita_normalizzata(text)`: la stessa normalizzazione delle unità del
--    codice (`normalizzaUnita`, src/lib/prezzario/confronto.ts). Nelle voci
--    delle commesse si trovano 21 grafie (m2/mq, cad./n., a.c./corpo…), nel
--    listino 8: senza normalizzarle un prezzo al pezzo finirebbe su dei metri
--    quadri. I sinonimi sono la stessa tabella di SINONIMI_UNITA; il test
--    unitaNormalizzata.test.ts confronta le due.
--
-- Nessuna regola di accesso cambia: le colonne nuove seguono quelle delle due
-- tabelle (prezzi della ditta = permesso sui costi).
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Colonne ------------------------------------------------------------------
alter table public.tariffa_costi_varianti
  add column if not exists subappaltatore_id uuid references public.subappaltatori(id) on delete set null;
alter table public.tariffe_aziendali
  add column if not exists subappaltatore_id uuid references public.subappaltatori(id) on delete set null;

create index if not exists tariffa_costi_varianti_subappaltatore_idx
  on public.tariffa_costi_varianti (subappaltatore_id) where subappaltatore_id is not null;
create index if not exists tariffe_aziendali_subappaltatore_idx
  on public.tariffe_aziendali (subappaltatore_id) where subappaltatore_id is not null;

comment on column public.tariffa_costi_varianti.subappaltatore_id is
  'Il subappaltatore (anagrafica) a cui vale questo prezzo. Copiato dalla squadra se c''è; può esserci senza squadra (listino della ditta).';
comment on column public.tariffe_aziendali.subappaltatore_id is
  'Voce del listino di quel subappaltatore (anagrafica). NULL = voce del listino aziendale.';

-- 2. Coerenza fra squadra, anagrafica e azienda --------------------------------
create or replace function public.listino_ditta_anagrafica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
  v_azienda uuid;
begin
  if new.external_team_id is not null then
    select e.subappaltatore_id into v_sub from public.external_teams e where e.id = new.external_team_id;
    if v_sub is not null then
      if new.subappaltatore_id is null
         or (tg_op = 'UPDATE'
             and new.external_team_id is distinct from old.external_team_id
             and new.subappaltatore_id is not distinct from old.subappaltatore_id) then
        new.subappaltatore_id := v_sub;
      elsif new.subappaltatore_id <> v_sub then
        raise exception using errcode = '23514',
          message = 'La squadra scelta appartiene a un altro subappaltatore.';
      end if;
    end if;
  end if;

  if new.subappaltatore_id is not null then
    select s.company_id into v_azienda from public.subappaltatori s where s.id = new.subappaltatore_id;
    if v_azienda is distinct from new.company_id then
      raise exception using errcode = '23514',
        message = 'Il subappaltatore è di un''altra azienda.';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.listino_ditta_anagrafica() from public, anon, authenticated;

drop trigger if exists listino_ditta_anagrafica on public.tariffa_costi_varianti;
create trigger listino_ditta_anagrafica
  before insert or update of external_team_id, subappaltatore_id, company_id
  on public.tariffa_costi_varianti
  for each row execute function public.listino_ditta_anagrafica();

drop trigger if exists listino_ditta_anagrafica on public.tariffe_aziendali;
create trigger listino_ditta_anagrafica
  before insert or update of external_team_id, subappaltatore_id, company_id
  on public.tariffe_aziendali
  for each row execute function public.listino_ditta_anagrafica();

-- La squadra collegata (o ricollegata) a un'anagrafica: le sue righe la seguono,
-- tranne quelle che hanno già un'altra anagrafica scritta a mano.
create or replace function public.squadra_anagrafica_al_listino()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subappaltatore_id is not distinct from old.subappaltatore_id then
    return new;
  end if;
  update public.tariffa_costi_varianti v
     set subappaltatore_id = new.subappaltatore_id
   where v.external_team_id = new.id
     and v.subappaltatore_id is not distinct from old.subappaltatore_id;
  update public.tariffe_aziendali t
     set subappaltatore_id = new.subappaltatore_id
   where t.external_team_id = new.id
     and t.subappaltatore_id is not distinct from old.subappaltatore_id;
  return new;
end;
$$;
revoke all on function public.squadra_anagrafica_al_listino() from public, anon, authenticated;

drop trigger if exists squadra_anagrafica_al_listino on public.external_teams;
create trigger squadra_anagrafica_al_listino
  after update of subappaltatore_id on public.external_teams
  for each row execute function public.squadra_anagrafica_al_listino();

-- 3. Le righe di oggi prendono l'anagrafica dalla squadra (66 righe, Demo 2) ----
update public.tariffa_costi_varianti v
   set subappaltatore_id = e.subappaltatore_id
  from public.external_teams e
 where e.id = v.external_team_id
   and e.company_id = v.company_id
   and e.subappaltatore_id is not null
   and v.subappaltatore_id is null;

update public.tariffe_aziendali t
   set subappaltatore_id = e.subappaltatore_id
  from public.external_teams e
 where e.id = t.external_team_id
   and e.company_id = t.company_id
   and e.subappaltatore_id is not null
   and t.subappaltatore_id is null;

-- 4. Unità di misura normalizzate ----------------------------------------------
-- Minuscole, senza spazi né punti, ² e ³ come cifre, poi i sinonimi. Uguale a
-- normalizzaUnita() del codice; la tabella fra i due segni SINONIMI è la stessa
-- di SINONIMI_UNITA e il test la rilegge da qui.
create or replace function public.unita_normalizzata(p_unita text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    -- SINONIMI_INIZIO
    '{"mq":"m2","m2":"m2","metroquadro":"m2","metriquadri":"m2","metroquadrato":"m2","mc":"m3","m3":"m3","metrocubo":"m3","metricubi":"m3","ml":"m","m":"m","mt":"m","metro":"m","metrolineare":"m","metrilineari":"m","cad":"cad","pz":"cad","pezzo":"cad","pezzi":"cad","n":"cad","nr":"cad","num":"cad","cadauno":"cad","kg":"kg","chilogrammo":"kg","chili":"kg","t":"t","ton":"t","tonnellata":"t","h":"h","ora":"h","ore":"h","l":"l","lt":"l","litro":"l","litri":"l","acorpo":"a corpo","acorpo1":"a corpo","corpo":"a corpo","ac":"a corpo","forfait":"a corpo","aforfait":"a corpo","fisso":"a corpo","gg":"gg","giorno":"gg","giorni":"gg","giornata":"gg","giornate":"gg","mese":"mese","mesi":"mese","paio":"paio","paia":"paio","km":"km","chilometro":"km","chilometri":"km","piano":"piano","piani":"piano"}'
    -- SINONIMI_FINE
      ::jsonb ->> x.t,
    x.t)
  from (select translate(regexp_replace(lower(coalesce(p_unita, '')), '[[:space:].]', '', 'g'), '²³', '23') as t) x
$$;
revoke all on function public.unita_normalizzata(text) from public, anon;
grant execute on function public.unita_normalizzata(text) to authenticated, service_role;

comment on function public.unita_normalizzata(text) is
  'Unità di misura normalizzata (mq/m²/m2 → m2, cad./n./pz → cad, a.c./corpo → a corpo…). Uguale a normalizzaUnita() in src/lib/prezzario/confronto.ts.';
