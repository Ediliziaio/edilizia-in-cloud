-- 23/11/2026 — «Dividi come le bolle»: con tutte le bolle della fattura caricate, ognuna con la sua
-- destinazione, il costo si divide esattamente come le bolle con un clic.
-- Prima lo faceva solo private.fattura_ddt_allinea, cioè solo col collegamento automatico acceso e
-- solo se nessuno aveva mai toccato la ripartizione: un'azienda con l'interruttore spento restava
-- con la percentuale scritta a mano anche quando le bolle dicevano altro. Qui la conferma è il clic
-- di una persona che può registrare costi; le regole su ordini e costi comuni restano le stesse.
create or replace function public.fattura_ddt_applica_bolle(p_fattura uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare f public.fatture_ricevute%rowtype; c public.company_costs%rowtype; piano jsonb; prossimo jsonb;
begin
  select * into f from public.fatture_ricevute where id = p_fattura for update;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_registrare_costi(f.company_id) then
    raise exception 'Non puoi modificare i costi di questa fattura.' using errcode = '42501';
  end if;
  if f.company_cost_id is null then
    raise exception 'Contabilizza prima la fattura: la divisione fra le commesse sta sul suo costo.' using errcode = '22023';
  end if;
  if f.purchase_order_id is not null or exists (select 1 from public.fattura_ricevuta_ordini where fattura_id = f.id)
     or exists (select 1 from public.fatture_ricevute where company_cost_id = f.company_cost_id and id <> f.id) then
    raise exception 'La fattura è su un ordine d''acquisto o su un costo comune ad altre fatture: dividila da lì.' using errcode = '22023';
  end if;
  select * into c from public.company_costs where id = f.company_cost_id and company_id = f.company_id for update;
  if not found or c.purchase_order_id is not null or c.order_external_team_id is not null or c.annullato_il is not null then
    raise exception 'La fattura è su un ordine d''acquisto o su un costo comune ad altre fatture: dividila da lì.' using errcode = '22023';
  end if;
  piano := private.fattura_ddt_piano(f.id);
  if not coalesce((piano->>'completo')::boolean, false) then
    raise exception 'Non tutte le bolle della fattura sono caricate con la loro commessa: dividila bolla per bolla.' using errcode = '22023';
  end if;
  if abs(abs(coalesce(c.amount, 0)) - (piano->>'base')::numeric) > 0.01 then
    raise exception 'Il costo registrato non vale quanto l''imponibile della fattura: controllalo prima di dividerlo.' using errcode = '22023';
  end if;
  prossimo := piano->'costo';
  -- La provenienza prima del costo, come in private.fattura_ddt_allinea: da qui le bolle comandano.
  insert into private.fattura_ddt_ripartizioni (fattura_id, cost_id, applicata, bloccata)
  values (f.id, c.id, prossimo, false)
  on conflict (fattura_id) do update set cost_id = excluded.cost_id, applicata = excluded.applicata, bloccata = false, updated_at = now();
  update public.company_costs
     set order_id = (prossimo->>'order_id')::uuid, allocations = prossimo->'allocations',
         quota_magazzino = (prossimo->>'quota_magazzino')::numeric, quota_magazzino_righe = null, updated_at = now()
   where id = c.id;
  return 'allineata';
end $$;
revoke all on function public.fattura_ddt_applica_bolle(uuid) from public, anon;
grant execute on function public.fattura_ddt_applica_bolle(uuid) to authenticated, service_role;
