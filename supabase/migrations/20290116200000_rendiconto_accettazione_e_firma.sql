-- Rendiconto: chi l'ha accettato, quando e come. O lo segna l'ufficio, o firma il committente col link.
set local lock_timeout = '3s';
alter table public.appalto_sal
  add column if not exists accettato_da_nome text,
  add column if not exists accettato_il date,
  add column if not exists accettato_come text,
  add column if not exists accettato_nota text,
  add column if not exists accettato_allegato_path text,
  add column if not exists firma_richiesta_id uuid;
alter table public.appalto_sal drop constraint if exists appalto_sal_accettato_come_check;
alter table public.appalto_sal add constraint appalto_sal_accettato_come_check
  check (accettato_come is null or accettato_come in ('carta', 'email', 'pec', 'voce', 'firma_elettronica'));

alter table public.signature_requests add column if not exists appalto_sal_id uuid references public.appalto_sal(id) on delete set null;
create index if not exists signature_requests_appalto_sal on public.signature_requests (appalto_sal_id) where appalto_sal_id is not null;
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.signature_requests'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo_documento%' loop
    execute format('alter table public.signature_requests drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.signature_requests add constraint signature_requests_tipo_documento_check
  check (tipo_documento = any (array['order','quote','sessione','odv','fv','subappalto','rendiconto'])) not valid;
alter table public.signature_requests validate constraint signature_requests_tipo_documento_check;

create or replace function public.appalto_sal_stato() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  new.updated_at := now();
  if old.stato <> 'bozza' and (new.totale is distinct from old.totale or new.netto is distinct from old.netto or new.ritenuta is distinct from old.ritenuta) then
    raise exception 'Gli importi si decidono in bozza: dopo l''invio il rendiconto non cambia' using errcode = '42501';
  end if;
  if old.stato in ('approvato', 'fatturato') and (new.accettato_da_nome is distinct from old.accettato_da_nome or new.accettato_il is distinct from old.accettato_il
      or new.accettato_come is distinct from old.accettato_come or new.firma_richiesta_id is distinct from old.firma_richiesta_id) then
    raise exception 'Chi ha accettato il rendiconto non si cambia: e'' la prova dell''accettazione' using errcode = '42501';
  end if;
  if new.stato is distinct from old.stato then
    if old.stato = 'bozza' and new.stato in ('approvato', 'fatturato') then
      raise exception 'Un rendiconto in bozza va prima mandato al committente' using errcode = '42501';
    end if;
    if old.stato = 'fatturato' then
      -- Unica uscita: la fattura e' stata annullata, il rendiconto torna da fatturare.
      if not (new.stato = 'approvato' and new.documento_fiscale_id is null and old.documento_fiscale_id is not null
              and exists (select 1 from public.documenti_fiscali d where d.id = old.documento_fiscale_id and d.stato = 'annullata')) then
        raise exception 'Un rendiconto fatturato non cambia piu'' stato' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.stato = 'approvato' and new.stato in ('bozza', 'inviato') then
      raise exception 'Un rendiconto approvato non torna indietro: e'' la prova di quello che hai fatturato' using errcode = '42501';
    end if;
    if new.stato = 'inviato' and new.inviato_at is null then
      new.inviato_at := now();
    end if;
    if new.stato = 'approvato' then
      if nullif(btrim(coalesce(new.accettato_da_nome, '')), '') is null or new.accettato_il is null or new.accettato_come is null then
        raise exception 'Scrivi chi ha accettato il rendiconto, quando e come' using errcode = '22023';
      end if;
      new.approvato_da := auth.uid();
      new.approvato_at := now();
      -- Accettato: un link di firma ancora aperto non serve piu'.
      update public.signature_requests set status = 'cancelled', updated_at = now()
       where appalto_sal_id = new.id and status in ('pending', 'otp_verified');
    end if;
  end if;
  return new;
end; $$;

create or replace function public.appalto_sal_firmato_dalla_richiesta() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.appalto_sal_id is not null and new.status = 'signed' and old.status is distinct from 'signed' then
    update public.appalto_sal
       set stato = 'approvato', accettato_da_nome = new.signer_name,
           accettato_il = (coalesce(new.signed_at, now()) at time zone 'Europe/Rome')::date,
           accettato_come = 'firma_elettronica', firma_richiesta_id = new.id
     where id = new.appalto_sal_id and stato = 'inviato';
  end if;
  return new;
end; $$;
revoke all on function public.appalto_sal_firmato_dalla_richiesta() from public, anon, authenticated;
drop trigger if exists trg_appalto_sal_firmato_dalla_richiesta on public.signature_requests;
create trigger trg_appalto_sal_firmato_dalla_richiesta after update of status on public.signature_requests
  for each row execute function public.appalto_sal_firmato_dalla_richiesta();

-- Ritirare un link mandato, per rimandarlo o per segnare a mano.
create or replace function public.appalto_sal_firma_annulla(p_id uuid) returns void language plpgsql security definer set search_path to '' as $$
declare c uuid;
begin
  select company_id into c from public.appalto_sal where id = p_id;
  if c is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(c)
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', c) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', c) is not true then
    raise exception 'Non hai il permesso' using errcode = '42501';
  end if;
  update public.signature_requests set status = 'cancelled', updated_at = now()
   where appalto_sal_id = p_id and status in ('pending', 'otp_verified');
end; $$;
revoke all on function public.appalto_sal_firma_annulla(uuid) from public, anon;
grant execute on function public.appalto_sal_firma_annulla(uuid) to authenticated;
