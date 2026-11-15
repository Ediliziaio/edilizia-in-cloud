-- Movimento bancario: tre collegamenti in più accanto a commessa, mezzo,
-- fornitore e personale.
--   oda      ordine d'acquisto al fornitore     (chi vede le commesse)
--   f24      tributo del modello F24            (chi vede la prima nota)
--   cespite  bene del registro dei cespiti      (chi vede la prima nota)
-- Come gli altri, sono riferimenti con una quota: non registrano pagamenti.

alter table public.bank_transaction_contexts drop constraint if exists bank_transaction_contexts_kind_check;
alter table public.bank_transaction_contexts add constraint bank_transaction_contexts_kind_check
  check (kind = any (array['commessa','mezzo','fornitore','dipendente','cedolino','oda','f24','cespite']));

-- Chi vede i tipi nuovi: una regola sola, letta da etichette, scelte e controlli.
create or replace function private.bank_tipo_visibile(p_company uuid, p_kind text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case p_kind
    when 'oda' then coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company), false)
    when 'f24' then coalesce(public.has_permission_for_company(auth.uid(), 'can_view_prima_nota', p_company), false)
    when 'cespite' then coalesce(public.has_permission_for_company(auth.uid(), 'can_view_prima_nota', p_company), false)
    else false
  end
$function$;
revoke all on function private.bank_tipo_visibile(uuid, text) from public, anon;

create or replace function private.bank_target(p_company uuid, p_kind text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
DECLARE j jsonb;
BEGIN
 IF p_kind='commessa' AND public.has_permission_for_company(auth.uid(),'can_view_orders',p_company) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' · ',order_code,description),'url','/azienda/ordini/'||id) INTO j FROM public.orders_visibili WHERE id=p_id AND company_id=p_company AND deleted_at IS NULL;
 ELSIF p_kind='mezzo' AND public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' · ',nome,targa),'url','/azienda/mezzi/'||id) INTO j FROM public.mezzi WHERE id=p_id AND company_id=p_company AND deleted_at IS NULL;
 ELSIF p_kind='fornitore' AND (public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) OR public.has_permission_for_company(auth.uid(),'can_view_billing',p_company)) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',name,'url',NULL) INTO j FROM public.suppliers WHERE id=p_id AND company_id=p_company;
 ELSIF p_kind IN('dipendente','cedolino') AND (public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid())) THEN
  IF p_kind='dipendente' THEN
   SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' ',nome,cognome),'url','/azienda/personale') INTO j FROM public.hr_profili WHERE id=p_id AND company_id=p_company;
  ELSE
   SELECT jsonb_build_object('id',h.id,'kind',p_kind,'label',concat('Cedolino ',lpad(h.mese::text,2,'0'),'/',h.anno,' · ',e.first_name,' ',e.last_name),'url','/azienda/personale') INTO j FROM public.hr_cedolini h JOIN public.employees e ON e.id=h.employee_id AND e.company_id=h.company_id WHERE h.id=p_id AND h.company_id=p_company;
  END IF;
 ELSIF p_kind='oda' AND private.bank_tipo_visibile(p_company,p_kind) THEN
  SELECT jsonb_build_object('id',o.id,'kind',p_kind,'label',concat_ws(' · ',CASE WHEN o.oda_number ILIKE 'oda%' THEN o.oda_number ELSE 'ODA '||o.oda_number END,s.name),'url','/azienda/ordini-acquisto/'||o.id)
    INTO j FROM public.purchase_orders o LEFT JOIN public.suppliers s ON s.id=o.supplier_id AND s.company_id=o.company_id WHERE o.id=p_id AND o.company_id=p_company;
 ELSIF p_kind='f24' AND private.bank_tipo_visibile(p_company,p_kind) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' · ','F24 '||lpad(mese::text,2,'0')||'/'||anno,tributo_code,tributo_descrizione),'url','/azienda/contabilita-fiscale')
    INTO j FROM public.f24_entries WHERE id=p_id AND company_id=p_company;
 ELSIF p_kind='cespite' AND private.bank_tipo_visibile(p_company,p_kind) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' · ',codice,descrizione),'url','/azienda/contabilita-generale')
    INTO j FROM public.cespiti WHERE id=p_id AND company_id=p_company;
 END IF;
 RETURN j;
END $function$;

create or replace function public.bank_context_choices(p_company uuid, p_kind text, p_search text default ''::text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
DECLARE ids uuid[];result jsonb;
BEGIN
 PERFORM private.bank_operativa_access(p_company,false);
 CASE p_kind
 WHEN 'commessa' THEN SELECT array_agg(id) INTO ids FROM public.orders_visibili WHERE company_id=p_company AND deleted_at IS NULL;
 WHEN 'mezzo' THEN IF public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) THEN SELECT array_agg(id) INTO ids FROM public.mezzi WHERE company_id=p_company AND deleted_at IS NULL;END IF;
 WHEN 'fornitore' THEN IF public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) OR public.has_permission_for_company(auth.uid(),'can_view_billing',p_company) THEN SELECT array_agg(id) INTO ids FROM public.suppliers WHERE company_id=p_company;END IF;
 WHEN 'dipendente' THEN IF public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid()) THEN SELECT array_agg(id) INTO ids FROM public.hr_profili WHERE company_id=p_company;END IF;
 WHEN 'cedolino' THEN IF public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid()) THEN SELECT array_agg(id) INTO ids FROM public.hr_cedolini WHERE company_id=p_company;END IF;
 -- Gli ordini più recenti prima: quelli che si pagano adesso.
 WHEN 'oda' THEN IF private.bank_tipo_visibile(p_company,p_kind) THEN SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.purchase_orders WHERE company_id=p_company AND coalesce(status,'')<>'bozza' ORDER BY created_at DESC LIMIT 2000) o;END IF;
 WHEN 'f24' THEN IF private.bank_tipo_visibile(p_company,p_kind) THEN SELECT array_agg(id) INTO ids FROM public.f24_entries WHERE company_id=p_company;END IF;
 WHEN 'cespite' THEN IF private.bank_tipo_visibile(p_company,p_kind) THEN SELECT array_agg(id) INTO ids FROM public.cespiti WHERE company_id=p_company AND coalesce(is_active,true);END IF;
 ELSE RAISE EXCEPTION 'Tipo di collegamento non valido';END CASE;
 SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM (SELECT private.bank_target(p_company,p_kind,x) j FROM unnest(ids) x) q
 WHERE j IS NOT NULL AND strpos(lower(j->>'label'),lower(btrim(p_search)))>0;
 RETURN (SELECT coalesce(jsonb_agg(j),'[]') FROM (SELECT j FROM jsonb_array_elements(result) j ORDER BY j->>'label' LIMIT 30) s);
END $function$;

-- Chi non vede un tipo non può nemmeno toglierlo salvando gli altri, e il
-- dettaglio lo segna come riservato: le stesse due regole dei tipi di prima.
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.bank_context_save'::regproc);
  if position('bank_tipo_visibile' in def) = 0 then
    def := replace(def,
      $a$IS NOT TRUE))) THEN RAISE EXCEPTION 'Alcuni collegamenti$a$,
      $b$IS NOT TRUE) OR (c.kind IN('oda','f24','cespite') AND private.bank_tipo_visibile(p_company,c.kind) IS NOT TRUE))) THEN RAISE EXCEPTION 'Alcuni collegamenti$b$);
    if position('bank_tipo_visibile' in def) = 0 then raise exception 'bank_context_save: testo atteso non trovato'; end if;
    execute def;
  end if;

  def := pg_get_functiondef('private.bank_movimento_links'::regproc);
  if position('bank_tipo_visibile' in def) = 0 then
    def := replace(def,
      $a$(r.kind='fornitore' AND (billing OR costs) IS NOT TRUE) THEN restricted:=true;$a$,
      $b$(r.kind='fornitore' AND (billing OR costs) IS NOT TRUE) OR (r.kind IN('oda','f24','cespite') AND private.bank_tipo_visibile(p_company,r.kind) IS NOT TRUE) THEN restricted:=true;$b$);
    if position('bank_tipo_visibile' in def) = 0 then raise exception 'bank_movimento_links: testo atteso non trovato'; end if;
    execute def;
  end if;
end $do$;
