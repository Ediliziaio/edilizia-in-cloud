-- Le righe di una bolla senza ordine d'acquisto entrano in giacenza (05/11/2026).
--
-- Fino a oggi il carico passava solo da una riga d'ordine: una bolla senza ODA restava
-- un documento, e caricarne cento in blocco non muoveva il magazzino.
--
-- Decisioni del titolare (05/11/2026):
--   * In CANTIERE la bolla non genera costi: il costo nasce dalla fattura. Generarlo qui
--     conterebbe due volte la stessa spesa, quindi questa funzione rifiuta la bolla di cantiere.
--   * In MAGAZZINO entra subito ciò che si abbina con certezza; il resto aspetta che una
--     persona scelga l'articolo o dica di crearne uno. La scelta arriva già pronta in `p_scelte`:
--     qui non si indovina niente.
--
-- Regole del magazzino rispettate:
--   * Una riga entra una volta sola: `ddt_righe.movimento_id` è la prova. Riprovare non raddoppia.
--   * `warehouse_stock.quantity` è un intero: una quantità decimale non si arrotonda, resta fuori.
--   * Il prezzo entra nel costo medio solo se è per pezzo (come in 20281129120000): altrimenti
--     il movimento non porta prezzo e il medio resta quello di prima.
--   * `caricata_a_magazzino_at` si scrive quando non resta nessuna riga da caricare.
--   * Una bolla con ODA non passa da qui: la merce entra dall'arrivo dell'ordine.

set local lock_timeout = '3s';

alter table public.ddt_righe
  add column if not exists stock_item_id uuid references public.warehouse_stock(id) on delete set null,
  add column if not exists movimento_id uuid references public.warehouse_movements(id) on delete set null;

comment on column public.ddt_righe.movimento_id is
  'Il carico in giacenza fatto da questa riga: è la prova che non va rifatto.';

-- Una riga già caricata non cambia quantità o articolo: il magazzino non la seguirebbe.
create or replace function public.ddt_riga_caricata_guardia()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.movimento_id is not null
     and (new.quantita is distinct from old.quantita or new.stock_item_id is distinct from old.stock_item_id) then
    raise exception 'Questa riga è già entrata in giacenza: la correzione si fa dal magazzino.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.ddt_riga_caricata_guardia() from public, anon, authenticated;

drop trigger if exists ddt_riga_caricata_guardia on public.ddt_righe;
create trigger ddt_riga_caricata_guardia
  before update on public.ddt_righe
  for each row execute function public.ddt_riga_caricata_guardia();

create or replace function public.bolla_carica_magazzino(p_ddt uuid, p_scelte jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set lock_timeout to '3s'
as $$
declare
  d public.ddt_ricezione%rowtype;
  r public.ddt_righe%rowtype;
  v_scelta jsonb;
  v_uid uuid := auth.uid();
  v_articolo public.warehouse_stock%rowtype;
  v_mov uuid;
  v_prezzo numeric;
  v_caricate int := 0;
  v_saltate jsonb := '[]'::jsonb;
begin
  select * into d from public.ddt_ricezione where id = p_ddt for update;
  if not found then raise exception 'Bolla non trovata.' using errcode = 'P0002'; end if;
  if v_uid is null or not (coalesce(public.has_permission_for_company(v_uid, 'can_edit_warehouse', d.company_id), false)
                           or public.e_super_admin_dentro(d.company_id)) then
    raise exception 'Il tuo ruolo non permette di caricare il magazzino.' using errcode = '42501';
  end if;
  if d.destinazione = 'cantiere' then
    raise exception 'La merce in cantiere non entra in giacenza: il costo arriva dalla fattura.' using errcode = 'P0001';
  end if;
  if d.purchase_order_id is not null then
    raise exception 'Questa bolla è legata a un ordine: la merce entra dall''arrivo dell''ordine.' using errcode = 'P0001';
  end if;
  if p_scelte is null or jsonb_typeof(p_scelte) <> 'array' then
    raise exception 'Scelte non valide.' using errcode = '22023';
  end if;

  for v_scelta in select * from jsonb_array_elements(p_scelte) loop
    select * into r from public.ddt_righe
     where id = nullif(v_scelta->>'riga_id', '')::uuid and ddt_ricezione_id = d.id for update;
    if not found then raise exception 'Una riga non è di questa bolla.' using errcode = '42501'; end if;
    -- Già caricata: riprovare non fa niente.
    continue when r.movimento_id is not null;
    if coalesce(r.quantita, 0) <= 0 or r.quantita <> trunc(r.quantita) then
      v_saltate := v_saltate || jsonb_build_object('riga_id', r.id, 'descrizione', r.descrizione,
        'motivo', 'il magazzino conta a pezzi interi: questa quantità non entra da sola');
      continue;
    end if;

    if coalesce((v_scelta->>'nuovo')::boolean, false) then
      -- Il codice della bolla diventa quello dell'articolo solo se è libero.
      insert into public.warehouse_stock (company_id, name, quantity, unit_cost, warehouse_id, supplier_id, internal_code)
      values (d.company_id, r.descrizione, 0, 0, d.warehouse_id, d.supplier_id,
              case when nullif(btrim(coalesce(r.codice_articolo, '')), '') is not null
                    and not exists (select 1 from public.warehouse_stock s
                                     where s.company_id = d.company_id and s.internal_code = btrim(r.codice_articolo))
                   then btrim(r.codice_articolo) end)
      returning * into v_articolo;
    else
      select * into v_articolo from public.warehouse_stock
       where id = nullif(v_scelta->>'stock_item_id', '')::uuid and company_id = d.company_id for update;
      if not found then raise exception 'Un articolo scelto non è di questa azienda.' using errcode = '42501'; end if;
      if v_articolo.warehouse_id is distinct from d.warehouse_id then
        raise exception 'L''articolo % sta in un altro magazzino.', v_articolo.name using errcode = 'P0001';
      end if;
    end if;

    v_prezzo := case when coalesce(r.prezzo_unitario, 0) > 0 and public.unita_confrontabile(r.unita_misura) = 'pz'
                     then r.prezzo_unitario end;
    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, unit_cost, notes, performed_by, warehouse_id, company_id)
    values (v_articolo.id, 'carico', r.quantita::int, v_prezzo, 'Bolla ' || d.numero_ddt, v_uid, d.warehouse_id, d.company_id)
    returning id into v_mov;
    update public.warehouse_stock
       set quantity = coalesce(quantity, 0) + r.quantita::int, last_delivery_date = d.data_ricezione
     where id = v_articolo.id;
    update public.ddt_righe set stock_item_id = v_articolo.id, movimento_id = v_mov where id = r.id;
    v_caricate := v_caricate + 1;
  end loop;

  update public.ddt_ricezione d2
     set caricata_a_magazzino_at = coalesce(d2.caricata_a_magazzino_at, now())
   where d2.id = d.id
     and exists (select 1 from public.ddt_righe x where x.ddt_ricezione_id = d.id)
     and not exists (select 1 from public.ddt_righe x where x.ddt_ricezione_id = d.id and x.movimento_id is null);

  return jsonb_build_object('caricate', v_caricate, 'saltate', v_saltate,
    'restano', (select count(*) from public.ddt_righe x where x.ddt_ricezione_id = d.id and x.movimento_id is null));
end;
$$;

revoke all on function public.bolla_carica_magazzino(uuid, jsonb) from public, anon;
grant execute on function public.bolla_carica_magazzino(uuid, jsonb) to authenticated, service_role;
