-- Lotto 1 del piano «Clienti privati, aziende e PA» (docs/piano-clienti-pa-commessa-fattura.md).
--
-- 1. Il tipo del cliente ha una fonte sola: anagrafiche_native.tipo_cliente
--    (B2C = Privato, B2B = Azienda, PA = Pubblica Amministrazione, Estero).
--    tipo_soggetto lo segue da un trigger, non più a mano.
-- 2. Nuove colonne: split_payment (null = decide l'impostazione dell'azienda),
--    codice_ipa (il codice dell'ente in IPA, NON il codice ufficio),
--    referente_amministrativo, tipo_confermato_at (chi ha scelto il tipo a mano).
-- 3. check_fiscal_partner_link lascia collegare cliente e anagrafica a
--    salva_anagrafica_cliente(), che controlla da sé i permessi (lotto 2).
-- 4. anagrafiche_pa_da_confermare: chi sembra una PA ma non è segnato come tale.
--    Nessuna riclassificazione automatica: si conferma a mano dalla scheda.
--
-- Idempotente.

alter table public.anagrafiche_native add column if not exists split_payment boolean;
alter table public.anagrafiche_native add column if not exists codice_ipa text;
alter table public.anagrafiche_native add column if not exists referente_amministrativo text;
alter table public.anagrafiche_native add column if not exists tipo_confermato_at timestamptz;

comment on column public.anagrafiche_native.tipo_cliente is
  'Fonte del tipo: B2C = Privato, B2B = Azienda, PA = Pubblica Amministrazione, Estero. tipo_soggetto la segue (trigger anagrafica_allinea_tipo).';
comment on column public.anagrafiche_native.split_payment is
  'Scissione dei pagamenti per questo cliente: true/false; null = decide l''impostazione dell''azienda.';
comment on column public.anagrafiche_native.codice_ipa is
  'Codice dell''ente nell''Indice PA (es. c_h501). Non è il Codice Univoco Ufficio: quelli stanno in anagrafica_uffici_pa.';
comment on column public.anagrafiche_native.tipo_confermato_at is
  'Quando qualcuno ha scelto il tipo a mano. Chi ce l''ha esce da anagrafiche_pa_da_confermare.';

-- 1. tipo_soggetto segue tipo_cliente -----------------------------------------
create or replace function public.anagrafica_allinea_tipo()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  da_soggetto text;
begin
  da_soggetto := case new.tipo_soggetto
    when 'fisico' then 'B2C' when 'giuridico' then 'B2B'
    when 'pa' then 'PA' when 'estero' then 'Estero' end;

  if new.tipo_cliente is null then
    new.tipo_cliente := coalesce(da_soggetto, 'B2B');
  elsif tg_op = 'INSERT' and new.tipo_cliente = 'B2B' and new.tipo_soggetto in ('pa', 'estero') then
    -- B2B è il valore predefinito della colonna: chi inserisce solo tipo_soggetto
    -- = 'pa' non ha scelto «Azienda».
    new.tipo_cliente := da_soggetto;
  elsif tg_op = 'UPDATE' and new.tipo_cliente is not distinct from old.tipo_cliente
        and new.tipo_soggetto is distinct from old.tipo_soggetto then
    -- Cambiato solo tipo_soggetto (codice vecchio): una ditta individuale resta azienda.
    if not (new.tipo_cliente = 'B2B' and new.tipo_soggetto = 'fisico') then
      new.tipo_cliente := coalesce(da_soggetto, new.tipo_cliente);
    end if;
  end if;

  new.tipo_soggetto := case new.tipo_cliente
    when 'B2C' then 'fisico'
    when 'PA' then 'pa'
    when 'Estero' then 'estero'
    -- Azienda: la ditta individuale (persona fisica con P.IVA) resta «fisico».
    else case when new.tipo_soggetto = 'fisico' then 'fisico' else 'giuridico' end
  end;
  return new;
end;
$fn$;
revoke all on function public.anagrafica_allinea_tipo() from public, anon, authenticated;

drop trigger if exists trg_anagrafica_allinea_tipo on public.anagrafiche_native;
create trigger trg_anagrafica_allinea_tipo
  before insert or update of tipo_cliente, tipo_soggetto on public.anagrafiche_native
  for each row execute function public.anagrafica_allinea_tipo();

-- 2. Il collegamento cliente↔anagrafica fatto da salva_anagrafica_cliente() ------
-- La funzione controlla da sé chi può: qui si salta solo il controllo del
-- permesso fatturazione, e solo dentro la sua transazione (set_config locale).
create or replace function public.check_fiscal_partner_link()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.cliente_id is not null and (tg_op='INSERT' or new.cliente_id is distinct from old.cliente_id or new.company_id is distinct from old.company_id or new.tipo is distinct from old.tipo) then
    if new.tipo not in ('cliente','entrambi') or not exists(select 1 from public.profiles p where p.id=new.cliente_id and p.company_id=new.company_id and public.profilo_solo_cliente(p.id)) then
      raise exception 'Cliente operativo non valido per questa anagrafica e azienda';
    end if;
  end if;
  if new.fornitore_id is not null then
    if new.tipo not in ('fornitore','entrambi') or not exists(select 1 from public.suppliers s where s.id=new.fornitore_id and s.company_id=new.company_id) then
      raise exception 'Fornitore non valido per questa anagrafica e azienda';
    end if;
  end if;
  if (tg_op='INSERT' and (new.fornitore_id is not null or new.cliente_id is not null)) or (tg_op='UPDATE' and (new.fornitore_id is distinct from old.fornitore_id or new.cliente_id is distinct from old.cliente_id or new.sync_from_cliente is distinct from old.sync_from_cliente)) then
    if coalesce(current_setting('eic.salva_anagrafica_cliente', true), '') = 'on'
       and new.fornitore_id is not distinct from (case when tg_op = 'UPDATE' then old.fornitore_id end) then
      return new;
    end if;
    if coalesce(auth.jwt()->>'role','')<>'service_role' and (auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(new.company_id) or not public.has_permission_for_company(auth.uid(),'can_view_billing',new.company_id)) then
      raise exception 'Non autorizzato alla riconciliazione';
    end if;
  end if;
  return new;
end; $function$;

-- 3. Chi sembra una PA e non è segnato come tale ------------------------------
create or replace view public.anagrafiche_pa_da_confermare
with (security_invoker = true) as
select a.id,
       a.company_id,
       a.cliente_id,
       coalesce(nullif(btrim(a.ragione_sociale), ''), btrim(concat_ws(' ', a.nome, a.cognome))) as denominazione,
       a.tipo_cliente,
       a.codice_sdi,
       a.codice_fiscale,
       a.partita_iva,
       concat_ws(' · ',
         case when upper(btrim(a.codice_sdi)) ~ '^[A-Z0-9]{6}$' and upper(btrim(a.codice_sdi)) <> '000000'
              then 'codice destinatario di 6 caratteri (come un ufficio PA)' end,
         case when coalesce(a.ragione_sociale, '') ~* '^\s*(comune|citt[aà] metropolitana|regione|provincia|unione (dei|di) comuni|comunit[aà] montana|asl|asp|ats|ausl|azienda (sanitaria|ospedaliera|usl)|ospedale|ministero|prefettura|questura|agenzia (delle|del|per)|universit[aà]|istituto (comprensivo|statale|tecnico|professionale)|liceo|scuola|consorzio di bonifica|camera di commercio|ater|aler|inps|inail)\M'
              then 'denominazione da ente pubblico' end
       ) as motivo
  from public.anagrafiche_native a
 where a.tipo in ('cliente', 'entrambi')
   and coalesce(a.attivo, true)
   and a.tipo_cliente is distinct from 'PA'
   and a.tipo_confermato_at is null
   and ((upper(btrim(a.codice_sdi)) ~ '^[A-Z0-9]{6}$' and upper(btrim(a.codice_sdi)) <> '000000')
        or coalesce(a.ragione_sociale, '') ~* '^\s*(comune|citt[aà] metropolitana|regione|provincia|unione (dei|di) comuni|comunit[aà] montana|asl|asp|ats|ausl|azienda (sanitaria|ospedaliera|usl)|ospedale|ministero|prefettura|questura|agenzia (delle|del|per)|universit[aà]|istituto (comprensivo|statale|tecnico|professionale)|liceo|scuola|consorzio di bonifica|camera di commercio|ater|aler|inps|inail)\M');

comment on view public.anagrafiche_pa_da_confermare is
  'Clienti che sembrano una Pubblica Amministrazione ma non sono segnati PA. Da confermare a mano; nessuna riclassificazione automatica.';
revoke all on public.anagrafiche_pa_da_confermare from public, anon;
grant select on public.anagrafiche_pa_da_confermare to authenticated, service_role;
