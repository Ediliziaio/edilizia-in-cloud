-- Un fornitore di tipo «subappalto» è un subappaltatore, non un magazzino edile
-- (05/11/2026, richiesta di Florin). Due conseguenze, entrambe automatiche.
--
-- 1) AGGANCIO ALLA SEZIONE SUBAPPALTATORI. Appena un fornitore prende il tipo
--    «subappalto», deve comparire anche nella sezione Subappaltatori (contratti,
--    SAL, ritenute, documenti). Oggi i due elenchi sono separati e `subappaltatore_id`
--    resta vuoto: su 78 fornitori «subappalto», 78 senza scheda subappaltatore.
--    Il trigger cerca una scheda già esistente della stessa azienda (per P.IVA, o
--    per ragione sociale quando la P.IVA manca) e, se non c'è, la crea; poi scrive
--    `subappaltatore_id` sulla scheda fornitore. Il fornitore RESTA un fornitore:
--    serve per costi e fatture. Lo aggiungiamo ai subappaltatori, non lo spostiamo.
--
-- 2) REVERSE CHARGE 0% IVA. Le fatture di un subappaltatore edile sono in inversione
--    contabile: imponibile sì, IVA 0 (la versa il committente). Il tipo «subappalto»
--    porta quindi `vat_rate = 0`. Tutte le maschere leggono `supplier.vat_rate ?? 22`
--    (form costi, selettore fornitore, etichetta in anagrafica), così il costo parte
--    da solo a 0% — e resta modificabile a mano sul singolo costo.
--
-- Il trigger è BEFORE: modifica NEW sul posto (niente UPDATE di ritorno, niente
-- ricorsione) e scatta solo quando cambia `tipo`, così una modifica a un altro
-- campo (telefono, IBAN…) non riazzera l'IVA messa a mano. SECURITY DEFINER perché
-- anche chi ha il solo permesso «Fornitori» (non per forza company_admin) deve poter
-- far nascere la scheda subappaltatore, che altrimenti la sua RLS gli vieterebbe:
-- la funzione ancora l'azienda a NEW.company_id, non si fida di altro.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.collega_fornitore_subappaltatore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_piva text := nullif(btrim(new.vat_number), '');
  v_nome text := nullif(btrim(new.name), '');
begin
  if new.tipo is distinct from 'subappalto' then
    return new;
  end if;

  -- Reverse charge: i subappaltatori fatturano in inversione contabile, IVA 0.
  new.vat_rate := 0;

  -- Già agganciato: non si tocca.
  if new.subappaltatore_id is not null then
    return new;
  end if;

  -- Scheda subappaltatore già presente per questa azienda? Prima la P.IVA, poi,
  -- solo se la P.IVA manca, la ragione sociale. Evita i doppioni.
  select s.id
    into v_id
    from public.subappaltatori s
   where s.company_id = new.company_id
     and (
           (v_piva is not null and nullif(btrim(s.piva), '') = v_piva)
        or (v_piva is null and v_nome is not null and lower(btrim(s.ragione_sociale)) = lower(v_nome))
         )
   order by s.created_at
   limit 1;

  if v_id is null then
    insert into public.subappaltatori (company_id, ragione_sociale, piva, email, telefono, indirizzo, is_active, notes)
    values (
      new.company_id,
      coalesce(v_nome, 'Subappaltatore'),
      v_piva,
      new.email,
      new.phone,
      new.address,
      true,
      'Creato dalla scheda fornitore (tipo «subappalto»).'
    )
    returning id into v_id;
  end if;

  new.subappaltatore_id := v_id;
  return new;
end $$;

revoke all on function public.collega_fornitore_subappaltatore() from public, anon, authenticated;

drop trigger if exists collega_fornitore_subappaltatore on public.suppliers;
create trigger collega_fornitore_subappaltatore
  before insert or update of tipo on public.suppliers
  for each row execute function public.collega_fornitore_subappaltatore();

-- Bonifica dei 78 fornitori «subappalto» già esistenti, una azienda alla volta:
-- stessa logica cerca-o-crea del trigger, poi aggancio e IVA a 0. L'UPDATE tocca
-- `subappaltatore_id` e `vat_rate` (non `tipo`), quindi il trigger qui sopra non
-- riscatta; scatta solo il controllo «stessa azienda», che passa.
do $backfill$
declare
  f record;
  v_id uuid;
  v_piva text;
  v_nome text;
begin
  for f in
    select id, company_id, name, vat_number, email, phone, address
      from public.suppliers
     where tipo = 'subappalto' and subappaltatore_id is null
  loop
    v_piva := nullif(btrim(f.vat_number), '');
    v_nome := nullif(btrim(f.name), '');

    select s.id
      into v_id
      from public.subappaltatori s
     where s.company_id = f.company_id
       and (
             (v_piva is not null and nullif(btrim(s.piva), '') = v_piva)
          or (v_piva is null and v_nome is not null and lower(btrim(s.ragione_sociale)) = lower(v_nome))
           )
     order by s.created_at
     limit 1;

    if v_id is null then
      insert into public.subappaltatori (company_id, ragione_sociale, piva, email, telefono, indirizzo, is_active, notes)
      values (f.company_id, coalesce(v_nome, 'Subappaltatore'), v_piva, f.email, f.phone, f.address, true,
              'Creato dalla scheda fornitore (tipo «subappalto»).')
      returning id into v_id;
    end if;

    update public.suppliers
       set subappaltatore_id = v_id,
           vat_rate = 0
     where id = f.id;
  end loop;
end $backfill$;
