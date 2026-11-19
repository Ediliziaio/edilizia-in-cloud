set local lock_timeout='3s';
set local statement_timeout='60s';

-- Le sole scadenze manuali aperte si modificano da qui. Il lock e la versione
-- impediscono di sovrascrivere un pagamento o una modifica arrivati nel frattempo.
create or replace function public.scadenza_modifica_manuale(p_id uuid,p_versione timestamptz,p_dati jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.scadenze%rowtype; v_importo numeric; v_data date; v_n integer;
begin
  if auth.uid() is null then raise exception 'Accedi prima di modificare una scadenza.' using errcode='42501'; end if;
  select * into s from public.scadenze where id=p_id for update;
  if not found or s.company_id is distinct from public.get_effective_company_id() then
    raise exception 'Scadenza non trovata o non visibile.' using errcode='42501';
  end if;
  if s.updated_at is distinct from p_versione then raise exception 'Questa scadenza è cambiata. Ricarica l''elenco prima di riprovare.' using errcode='PT409'; end if;
  if s.status<>'da_pagare' or coalesce(s.paid_amount,0)<>0 or s.prima_nota_entry_id is not null then
    raise exception 'La scadenza ha un pagamento o non è più aperta. Usa il percorso del pagamento.' using errcode='22023';
  end if;
  if coalesce(s.is_auto_generated,false) or s.invoice_id is not null or s.cost_id is not null or s.order_item_id is not null then
    raise exception 'Questa scadenza viene da un documento: modifica il documento di origine.' using errcode='22023';
  end if;
  v_importo:=round((p_dati->>'amount')::numeric,2);
  v_data:=(p_dati->>'due_date')::date;
  if v_importo is null or v_importo<=0 or v_importo::text in ('NaN','Infinity','-Infinity') or v_data is null
     or nullif(btrim(p_dati->>'description'),'') is null or length(p_dati->>'description')>500
     or length(coalesce(p_dati->>'payment_method',''))>80 then
    raise exception 'Controlla descrizione, importo, data e metodo di pagamento.' using errcode='22023';
  end if;
  update public.scadenze set description=btrim(p_dati->>'description'),amount=v_importo,due_date=v_data,
    payment_method=nullif(btrim(p_dati->>'payment_method'),''),notes=nullif(btrim(p_dati->>'notes'),'')
    where id=s.id and company_id=s.company_id;
  get diagnostics v_n=row_count;
  if v_n<>1 then raise exception 'Non hai il permesso di modificare questa scadenza.' using errcode='42501'; end if;
  return jsonb_build_object('id',s.id,'modificata',true);
end; $$;

create or replace function public.scadenza_annulla_manuale(p_id uuid,p_versione timestamptz)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.scadenze%rowtype; v_n integer;
begin
  if auth.uid() is null then raise exception 'Accedi prima di annullare una scadenza.' using errcode='42501'; end if;
  select * into s from public.scadenze where id=p_id for update;
  if not found or s.company_id is distinct from public.get_effective_company_id() then
    raise exception 'Scadenza non trovata o non visibile.' using errcode='42501';
  end if;
  if s.updated_at is distinct from p_versione then raise exception 'Questa scadenza è cambiata. Ricarica l''elenco prima di riprovare.' using errcode='PT409'; end if;
  if s.status<>'da_pagare' or coalesce(s.paid_amount,0)<>0 or s.prima_nota_entry_id is not null then
    raise exception 'La scadenza ha un pagamento o non è più aperta. Usa il percorso del pagamento.' using errcode='22023';
  end if;
  if coalesce(s.is_auto_generated,false) or s.invoice_id is not null or s.cost_id is not null or s.order_item_id is not null then
    raise exception 'Questa scadenza viene da un documento: modifica il documento di origine.' using errcode='22023';
  end if;
  update public.scadenze set status='annullata' where id=s.id and company_id=s.company_id;
  get diagnostics v_n=row_count;
  if v_n<>1 then raise exception 'Non hai il permesso di annullare questa scadenza.' using errcode='42501'; end if;
  return jsonb_build_object('id',s.id,'annullata',true);
end; $$;

-- Una registrazione bancaria o di un costo si corregge dalla sua origine,
-- come già previsto per la modifica; non deve perdere il collegamento con un delete.
create or replace function public.prima_nota_elimina(p_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.prima_nota_entries%rowtype; v_motivo text; v_n integer; v_pag integer;
begin
  select * into p from public.prima_nota_entries where id=p_id for update;
  if not found then raise exception 'Registrazione non trovata o non visibile.' using errcode='P0002'; end if;
  v_motivo:=public.prima_nota_modificabile(p);
  if v_motivo is not null then raise exception '%',v_motivo using errcode='P0001'; end if;
  delete from public.invoice_payments where reference='prima_nota:'||p.id and company_id=p.company_id;
  get diagnostics v_pag=row_count;
  delete from public.prima_nota_entries where id=p.id;
  get diagnostics v_n=row_count;
  if v_n<>1 then raise exception 'Non hai il permesso di eliminare questa registrazione.' using errcode='42501'; end if;
  return jsonb_build_object('eliminata',true,'incassi_tolti',v_pag,'invoice_id',p.invoice_id);
end; $$;

-- La rettifica di una manuale è storno + nuova scrittura, nella medesima
-- transazione. Le due funzioni esistenti verificano i permessi e i periodi chiusi.
create or replace function public.contabilita_rettifica_scrittura(
  p_scrittura uuid,p_data date,p_causale text,p_descrizione text,p_documento_numero text,p_documento_data date,p_righe jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.contabilita_scritture%rowtype; v_storno uuid; v_nuova uuid;
begin
  if auth.uid() is null then raise exception 'Accedi prima di rettificare una scrittura.' using errcode='42501'; end if;
  select * into s from public.contabilita_scritture where id=p_scrittura;
  if not found or s.company_id is distinct from public.get_effective_company_id() then
    raise exception 'Scrittura non trovata o non visibile.' using errcode='42501';
  end if;
  if s.origine<>'manuale' or s.storno_di is not null then
    raise exception 'Si rettificano qui le scritture manuali. Per una registrazione automatica correggi il documento di origine.' using errcode='22023';
  end if;
  v_storno:=public.contabilita_storna_scrittura(s.id,p_data,'Rettifica della scrittura '||s.numero||'/'||s.esercizio);
  v_nuova:=public.contabilita_registra_scrittura(s.company_id,p_data,p_causale,p_descrizione,p_documento_numero,p_documento_data,p_righe);
  return jsonb_build_object('storno_id',v_storno,'nuova_id',v_nuova);
end; $$;

create or replace function public.contabilita_storni_dell_esercizio(p_company uuid,p_anno integer)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(distinct s.storno_di),'[]'::jsonb)
    from public.contabilita_scritture s join public.contabilita_scritture o on o.id=s.storno_di and o.company_id=s.company_id
    where s.company_id=p_company and o.esercizio=p_anno;
$$;
revoke all on function public.contabilita_storni_dell_esercizio(uuid,integer) from public,anon;
grant execute on function public.contabilita_storni_dell_esercizio(uuid,integer) to authenticated;
revoke all on function public.contabilita_rettifica_scrittura(uuid,date,text,text,text,date,jsonb) from public,anon;
grant execute on function public.contabilita_rettifica_scrittura(uuid,date,text,text,text,date,jsonb) to authenticated;
revoke all on function public.scadenza_modifica_manuale(uuid,timestamptz,jsonb) from public,anon;
revoke all on function public.scadenza_annulla_manuale(uuid,timestamptz) from public,anon;
revoke all on function public.prima_nota_elimina(uuid) from public,anon;
grant execute on function public.scadenza_modifica_manuale(uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.scadenza_annulla_manuale(uuid,timestamptz) to authenticated;
grant execute on function public.prima_nota_elimina(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
