-- Reverse charge e acquisti dall'estero: l'integrazione si fa da dentro.
--
-- 508 fatture ricevute in reverse charge e nessuna integrazione TD16: il tipo non si
-- poteva creare. Il generatore XML sapeva già scrivere TD16-TD19 a parti invertite, ma
-- il CHECK e documento_crea li rifiutavano. Qui si ammettono, si legano alla fattura
-- ricevuta che integrano, e una ricevuta non si integra due volte.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.documenti_fiscali
  add column if not exists fattura_ricevuta_id uuid references public.fatture_ricevute(id) on delete set null;

comment on column public.documenti_fiscali.fattura_ricevuta_id is
  'La fattura ricevuta che questa integrazione (TD16-TD19) o autofattura regolarizza.';

create unique index if not exists documenti_fiscali_una_integrazione_per_ricevuta
  on public.documenti_fiscali (fattura_ricevuta_id)
  where fattura_ricevuta_id is not null and deleted_at is null and stato <> 'annullata';

alter table public.documenti_fiscali drop constraint if exists documenti_fiscali_tipo_check;
alter table public.documenti_fiscali add constraint documenti_fiscali_tipo_check check (tipo = any (array[
  'fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa','proforma','preventivo','ddt',
  'reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'
]));

-- Ogni funzione che elenca i tipi fiscali ammette i nuovi, stessa serie delle fatture.
do $migrazione$
declare
  firma text;
  d text;
  n text;
  c_tipi constant text := $x$'autofattura','fattura_riepilogativa','reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'$x$;
begin
  foreach firma in array array[
    'public.documento_crea(uuid,jsonb)', 'public.documento_emetti(uuid)', 'public.documento_emetti_oggi(uuid)',
    'public.documento_assegna_numero(uuid,integer)', 'public.documento_numero_nella_serie(uuid,text,integer,integer,uuid)',
    'public.documento_elimina_bozza(uuid)', 'public.documento_ripristina(uuid)',
    'public.documenti_fiscali_proteggi_emessi()', 'public.documento_fiscale_e_immutabile(text,text)', 'public.fe_operations_stats()'
  ] loop
    d := pg_get_functiondef(firma::regprocedure);
    if position('reverse_charge_interno' in d) = 0 then
      n := regexp_replace(d, $x$'autofattura',\s*'fattura_riepilogativa'$x$, c_tipi, 'g');
      if n = d then raise exception '% è cambiata: rivedere la migrazione', firma; end if;
      execute n;
    end if;
  end loop;

  foreach firma in array array['public.genera_numero_documento_native(uuid,text,integer)', 'public.rilascia_numero_documento(uuid)'] loop
    d := pg_get_functiondef(firma::regprocedure);
    if position('reverse_charge_interno' in d) = 0 then
      n := regexp_replace(d, $x$'integrazione_servizi_estero'$x$, $x$'reverse_charge_interno','integrazione_servizi_estero'$x$, 'g');
      if n = d then raise exception '% è cambiata: rivedere la migrazione', firma; end if;
      execute n;
    end if;
  end loop;

  d := pg_get_functiondef('public.get_documenti_counts(uuid)'::regprocedure);
  if position('reverse_charge_interno' in d) = 0 then
    n := replace(d, $x$tipo in ('fattura', 'fattura_pa')$x$,
      $x$tipo in ('fattura', 'fattura_pa', 'autofattura', 'reverse_charge_interno', 'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue')$x$);
    if n = d then raise exception 'get_documenti_counts è cambiata: rivedere la migrazione'; end if;
    execute n;
  end if;
end
$migrazione$;
