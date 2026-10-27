-- The existing project RLS and signed-document protections remain unchanged.
alter table public.sr_progetti add column if not exists analisi_intervento jsonb;
alter table public.sr_progetti add constraint sr_analisi_intervento_formato check (
  analisi_intervento is null or coalesce((
    jsonb_typeof(analisi_intervento) = 'object'
    and analisi_intervento ->> 'versione' = '1'
    and analisi_intervento ->> 'esistente' in ('alluminio_freddo','legno','pvc','altro')
    and jsonb_typeof(analisi_intervento -> 'posa') = 'object'
    and jsonb_typeof(analisi_intervento -> 'problemi') = 'array'
    and octet_length(analisi_intervento::text) <= 16384
  ), false)
);

create function public.sr_proteggi_analisi_firmata()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.analisi_intervento is distinct from new.analisi_intervento
     and (old.firmato_il is not null or old.stato::text = 'accettato') then
    raise exception 'Il preventivo firmato non si modifica. Crea una revisione.';
  end if;
  return new;
end;
$$;
revoke all on function public.sr_proteggi_analisi_firmata() from public;
create trigger sr_proteggi_analisi_firmata before update of analisi_intervento on public.sr_progetti
for each row execute function public.sr_proteggi_analisi_firmata();
