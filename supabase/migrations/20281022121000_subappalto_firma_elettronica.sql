-- Il contratto di subappalto si firma con la firma elettronica dell'app (link via
-- email, codice OTP via email o SMS, PDF firmato con certificato), come preventivi
-- e moduli.
--
-- 1. `signature_requests` accetta il tipo «subappalto» e si lega al contratto.
-- 2. Il contratto tiene il PDF congelato all'invio (`pdf_path`, nel bucket
--    quote-pdfs come gli altri documenti firmabili) e l'ultima richiesta di firma.
-- 3. Quando la firma è completata, il contratto risulta firmato da solo: data e
--    nome di chi ha firmato arrivano dalla richiesta, nessuno li scrive a mano.

alter table public.signature_requests drop constraint if exists signature_requests_tipo_documento_check;
alter table public.signature_requests add constraint signature_requests_tipo_documento_check
  check (tipo_documento = any (array['order', 'quote', 'sessione', 'odv', 'fv', 'subappalto']));

alter table public.signature_requests
  add column if not exists contratto_subappalto_id uuid references public.contratti_subappalto(id) on delete set null;
create index if not exists idx_signature_requests_contratto_sub on public.signature_requests (contratto_subappalto_id) where contratto_subappalto_id is not null;

alter table public.contratti_subappalto
  add column if not exists pdf_path text,
  add column if not exists firma_richiesta_id uuid references public.signature_requests(id) on delete set null;

create or replace function public.subappalto_firmato_dalla_richiesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contratto_subappalto_id is not null then
    if new.status = 'signed' and old.status is distinct from 'signed' then
      update public.contratti_subappalto
         set firmato_il = coalesce(new.signed_at, now()), firmato_da = new.signer_name, firma_richiesta_id = new.id
       where id = new.contratto_subappalto_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_subappalto_firmato_dalla_richiesta on public.signature_requests;
create trigger trg_subappalto_firmato_dalla_richiesta after update of status on public.signature_requests
  for each row execute function public.subappalto_firmato_dalla_richiesta();
revoke all on function public.subappalto_firmato_dalla_richiesta() from public, anon, authenticated;
