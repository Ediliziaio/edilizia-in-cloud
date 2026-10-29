-- ════════════════════════════════════════════════════════════════════════════
-- Dal rendiconto alla fattura: il regime IVA, l'aggancio, la prova dell'emissione
-- ════════════════════════════════════════════════════════════════════════════
-- Ultimo pezzo della Fase 5 del Modulo Appaltatori (28/10/2026).
--
-- Tre cose, e ognuna risolve un modo di sbagliare:
--
-- 1. `appalto_contratti.regime_iva`. Un subappalto edile fra due imprese va in
--    INVERSIONE CONTABILE (art. 17 co. 6 lett. a DPR 633/72, natura N6.3): la
--    fattura non espone l'IVA. Non e' una decisione da prendere ogni volta che
--    si fattura, perche' con lo stesso committente e' sempre la stessa: sta sul
--    contratto, dove stanno la ritenuta e i giorni di pagamento. Il valore
--    predefinito e' 'ordinaria', cosi' i contratti che esistono non cambiano
--    regime da soli: chi fa reverse charge lo dichiara.
--
-- 2. `appalto_sal_collega_fattura`. Un rendiconto e una fattura si agganciano
--    1 a 1: un indice unico impedisce che due rendiconti si dichiarino entrambi
--    fatturati dallo stesso documento (sarebbe lo stesso incasso contato due
--    volte). Un rendiconto in BOZZA non si fattura: le sue righe non sono
--    nemmeno congelate.
--
-- 3. La PROVA. Lo stato 'fatturato' non lo decide il bottone: lo decide
--    l'emissione della fattura. Una bozza di fattura agganciata lascia il
--    rendiconto dov'era; quando quella fattura viene emessa, un trigger su
--    `documenti_fiscali` porta il rendiconto a 'fatturato'. Stessa idea
--    dell'allarme credito AI: si chiude con una prova, non con un'intenzione.
--    Resta il passaggio a mano per chi non emette la fattura dalla
--    piattaforma — alcuni committenti fanno loro l'autofattura.
--
-- Nessuna riga di dati riscritta (solo il default della colonna nuova).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Il regime IVA, sul contratto ─────────────────────────────────────────

alter table public.appalto_contratti
  add column if not exists regime_iva text not null default 'ordinaria';

alter table public.appalto_contratti drop constraint if exists appalto_contratti_regime_iva_check;
alter table public.appalto_contratti
  add constraint appalto_contratti_regime_iva_check
  check (regime_iva in ('ordinaria', 'reverse_charge')) not valid;
alter table public.appalto_contratti validate constraint appalto_contratti_regime_iva_check;

comment on column public.appalto_contratti.regime_iva is
  '"reverse_charge" = subappalto nel settore edile, art. 17 co. 6 lett. a) DPR 633/72: la fattura non espone l''IVA (natura N6.3). Sta sul contratto perche'' con lo stesso committente e'' sempre lo stesso, e sbagliarlo a mano su una fattura e'' un errore fiscale.';

-- ── 2. Un rendiconto, una fattura ───────────────────────────────────────────

create unique index if not exists appalto_sal_un_documento
  on public.appalto_sal(documento_fiscale_id)
  where documento_fiscale_id is not null;

create or replace function public.appalto_sal_collega_fattura(
  p_sal_id uuid,
  p_documento_id uuid
) returns void language plpgsql security definer set search_path = '' as $fn$
declare v_sal record; v_doc record;
begin
  select id, company_id, committente_id, stato, numero
    into v_sal from public.appalto_sal where id = p_sal_id;
  if v_sal.id is null then
    raise exception 'Rendiconto inesistente' using errcode = '23503';
  end if;
  if auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_sal.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_sal.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_sal.company_id) then
    raise exception 'Non puoi agganciare la fattura di questo rendiconto' using errcode = '42501';
  end if;
  if v_sal.stato = 'bozza' then
    raise exception 'Il rendiconto n. % e'' ancora in bozza: le sue righe non sono congelate, non si fattura',
      v_sal.numero using errcode = '42501';
  end if;

  select id, company_id, stato, tipo, numero
    into v_doc from public.documenti_fiscali
   where id = p_documento_id and deleted_at is null;
  if v_doc.id is null then
    raise exception 'Documento inesistente' using errcode = '23503';
  end if;
  if v_doc.company_id is distinct from v_sal.company_id then
    raise exception 'Il documento e'' di un''altra azienda' using errcode = '42501';
  end if;
  -- Un DDT o un preventivo non fatturano niente.
  if v_doc.tipo not in ('fattura', 'fattura_pa', 'fattura_riepilogativa', 'fattura_accompagnatoria',
                        'fattura_differita_b', 'acconto_fattura', 'parcella', 'acconto_parcella',
                        'reverse_charge_interno', 'proforma') then
    raise exception 'Un documento di tipo "%" non puo'' fatturare un rendiconto', v_doc.tipo
      using errcode = '23514';
  end if;

  update public.appalto_sal set documento_fiscale_id = p_documento_id where id = p_sal_id;

  -- Se quella fattura e' GIA' emessa, il rendiconto e' fatturato adesso: la
  -- prova c'e'. Se e' una bozza, lo decidera' la sua emissione (trigger sotto).
  if v_doc.stato not in ('bozza', 'annullata') and v_sal.stato <> 'fatturato' then
    update public.appalto_sal set stato = 'fatturato' where id = p_sal_id;
  end if;
exception
  when unique_violation then
    raise exception 'Quella fattura e'' gia'' agganciata a un altro rendiconto: lo stesso incasso non si conta due volte'
      using errcode = '23505';
end;
$fn$;
revoke all on function public.appalto_sal_collega_fattura(uuid, uuid) from public, anon;
grant execute on function public.appalto_sal_collega_fattura(uuid, uuid) to authenticated, service_role;
comment on function public.appalto_sal_collega_fattura(uuid, uuid) is
  'Aggancia una fattura a un rendiconto (1 a 1). Se la fattura e'' gia'' emessa il rendiconto passa a «fatturato» subito; se e'' una bozza ci passera'' quando viene emessa.';

-- Staccare una fattura agganciata per errore. NON riporta indietro lo stato:
-- un rendiconto «fatturato» puo' esserlo anche senza una fattura nostra, perche'
-- il committente ha fatto lui l'autofattura. Lo stato lo si corregge, se serve,
-- annullando e ricomponendo.
create or replace function public.appalto_sal_scollega_fattura(p_sal_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_company uuid;
begin
  select company_id into v_company from public.appalto_sal where id = p_sal_id;
  if v_company is null then
    raise exception 'Rendiconto inesistente' using errcode = '23503';
  end if;
  if auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_company)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) then
    raise exception 'Non puoi staccare la fattura di questo rendiconto' using errcode = '42501';
  end if;
  update public.appalto_sal set documento_fiscale_id = null where id = p_sal_id;
end;
$fn$;
revoke all on function public.appalto_sal_scollega_fattura(uuid) from public, anon;
grant execute on function public.appalto_sal_scollega_fattura(uuid) to authenticated, service_role;

-- ── 3. La prova: l'emissione della fattura chiude il rendiconto ─────────────

create or replace function public.appalto_sal_fattura_emessa()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.stato not in ('bozza', 'annullata') then
    update public.appalto_sal
       set stato = 'fatturato'
     where documento_fiscale_id = new.id
       and stato <> 'fatturato';
  end if;
  return null;
end;
$fn$;
revoke all on function public.appalto_sal_fattura_emessa() from public, anon, authenticated;

drop trigger if exists trg_appalto_sal_fattura_emessa on public.documenti_fiscali;
create trigger trg_appalto_sal_fattura_emessa
  after update of stato on public.documenti_fiscali
  for each row
  when (new.stato is distinct from old.stato)
  execute function public.appalto_sal_fattura_emessa();

comment on function public.appalto_sal_fattura_emessa() is
  'Quando una fattura agganciata a un rendiconto viene emessa, il rendiconto passa a «fatturato». Lo stato lo decide l''emissione, non un bottone. Scatta solo sul cambio di stato e cerca per indice unico: su documenti_fiscali, che e'' una tabella calda, non costa niente.';
