-- 23/11/2026 — Il costo di una fattura sulla commessa, visto dalle bolle.
-- Caso: una fattura di calcestruzzo (41 bolle citate) divisa a mano al 56,69% su una commessa,
-- mentre l'unica bolla caricata consegnata lì vale 468 €. Nessuno poteva
-- accorgersene dalla tabella della commessa: ora, per ogni fattura, la commessa sa
--   quante bolle la fattura cita e quante sono caricate,
--   quante bolle collegate hanno consegnato merce QUI e quanto vale quella merce (IVA esclusa),
--   quante righe consegnate qui sono ancora senza prezzo.
-- Sola lettura. Valori = costi: solo chi vede i costi (puo_vedere_costi).
create or replace function public.commessa_fatture_bolle(p_order uuid, p_fatture uuid[])
returns table(fattura_id uuid, bolle_citate integer, bolle_caricate integer, bolle_qui integer,
              valore_qui numeric, righe_senza_prezzo integer)
language plpgsql stable security definer set search_path = '' as $$
declare azienda uuid;
begin
  select o.company_id into azienda from public.orders o where o.id = p_order;
  if azienda is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not coalesce(public.user_can_access_company(azienda), false)
     or not coalesce(public.puo_vedere_costi(azienda) or public.e_super_admin_dentro(azienda), false) then
    raise exception 'Non puoi vedere i costi di questa commessa' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_fatture), 0) = 0 then return; end if;
  if cardinality(p_fatture) > 500 then raise exception 'Troppe fatture in una richiesta' using errcode = '22023'; end if;
  return query
  with legami as (
    select l.fattura_ricevuta_id fid, l.ddt_ricezione_id did
      from public.fattura_ddt l
      join public.fatture_ricevute f on f.id = l.fattura_ricevuta_id and f.company_id = azienda
     where l.company_id = azienda and l.fattura_ricevuta_id = any(p_fatture)
  ), consegnato as (
    -- Quanto di ogni riga è arrivato su questa commessa: ingressi meno resi.
    select c.ddt_id did, c.riga_id, sum(case when c.tipo = 'reso' then -c.quantita else c.quantita end) q
      from public.ddt_consegne c
     where c.company_id = azienda and c.order_id = p_order and c.tipo in ('ingresso', 'reso')
       and c.ddt_id in (select did from legami where did is not null)
     group by 1, 2
  ), righe_qui as (
    select r.ddt_ricezione_id did, r.id, coalesce(k.q, r.quantita) q, r.prezzo_unitario p
      from public.ddt_righe r
      join public.ddt_ricezione d on d.id = r.ddt_ricezione_id and d.company_id = azienda
      left join consegnato k on k.riga_id = r.id
     where r.company_id = azienda and r.ddt_ricezione_id in (select did from legami where did is not null)
       -- Con le consegne vale quanto consegnato qui; senza, la bolla intestata a questa commessa.
       and (k.riga_id is not null or (d.order_id = p_order
            and not exists (select 1 from public.ddt_consegne c2 where c2.riga_id = r.id and c2.company_id = azienda)))
       and coalesce(k.q, r.quantita, 0) > 0
  ), per_bolla as (
    select did, sum(q * coalesce(p, 0)) valore, count(*) filter (where coalesce(p, 0) = 0) senza
      from righe_qui group by did
  )
  select x.fid,
         count(*)::integer,
         count(x.did)::integer,
         count(distinct b.did)::integer,
         round(coalesce(sum(b.valore), 0), 2),
         coalesce(sum(b.senza), 0)::integer
    from legami x left join per_bolla b on b.did = x.did
   group by x.fid;
end $$;
revoke all on function public.commessa_fatture_bolle(uuid, uuid[]) from public, anon;
grant execute on function public.commessa_fatture_bolle(uuid, uuid[]) to authenticated, service_role;
