-- ============================================================================
-- Lotto 5 del piano subappalto (docs/piano-subappalto-computo-listino.md):
-- il contratto nasce dagli affidamenti della ditta.
--
-- Le righe dell'elenco lavori (contratti_subappalto.elenco_lavori, jsonb) che
-- vengono da un affidamento portano `affidamento_id` e `voce_id`. Quando un
-- contratto NON firmato si scrive (nuovo, o elenco cambiato), nello stesso
-- passaggio:
--   - ogni affidamento citato passa «a contratto», con quantità e prezzo della
--     riga (il contratto è la verità: se il prezzo è cambiato diventa «a mano»);
--   - gli affidamenti che erano di questo contratto e non ci sono più tornano
--     in bozza;
--   - un affidamento di un'altra commessa, di un'altra ditta o già in un altro
--     contratto, o una quantità oltre il resto della voce, annullano TUTTO il
--     salvataggio: niente contratto a metà.
-- Dopo la firma non si tocca niente (lotto 8: varianti).
-- Il trigger è SECURITY DEFINER perché il browser non scrive gli affidamenti;
-- chi arriva qui ha già passato le regole di scrittura del contratto e il
-- controllo non dipende da current_user.
-- ============================================================================

set local lock_timeout = '3s';

create or replace function public.contratto_aggancia_affidamenti()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anagrafica uuid;
  v_righe jsonb;
  r record;
  v_a public.subappalto_affidamenti%rowtype;
  v_tot numeric;
  v_altri numeric;
  v_desc text;
  v_presi uuid[] := '{}';
begin
  if new.firmato_il is not null then return null; end if;
  if tg_op = 'UPDATE' and new.elenco_lavori is not distinct from old.elenco_lavori then return null; end if;

  -- Il contratto punta alla scheda sicurezza; gli affidamenti all'anagrafica della ditta.
  select s.campo_subappaltatore_id into v_anagrafica
    from public.subappaltatori_sicurezza s where s.id = new.subappaltatore_id;
  v_anagrafica := coalesce(v_anagrafica, new.subappaltatore_id);

  v_righe := case when jsonb_typeof(new.elenco_lavori) = 'array' then new.elenco_lavori else '[]'::jsonb end;

  for r in
    select nullif(e->>'affidamento_id', '')::uuid as id,
           coalesce(nullif(e->>'quantita', '')::numeric, 0) as quantita,
           coalesce(nullif(e->>'prezzo', '')::numeric, 0) as prezzo
      from jsonb_array_elements(v_righe) e
     where nullif(e->>'affidamento_id', '') is not null
  loop
    if r.id = any(v_presi) then
      raise exception using errcode = '23514', message = 'Lo stesso lavoro affidato compare due volte nell''elenco del contratto.';
    end if;
    select * into v_a from public.subappalto_affidamenti a where a.id = r.id for update;
    if not found or v_a.order_id is distinct from new.order_id or v_a.company_id is distinct from new.company_id then
      raise exception using errcode = '23514', message = 'Una riga del contratto viene da un affidamento che non è di questa commessa.';
    end if;
    if v_a.subappaltatore_id is distinct from v_anagrafica then
      raise exception using errcode = '23514', message = 'Una riga del contratto è affidata a un''altra ditta.';
    end if;
    if v_a.contratto_id is not null and v_a.contratto_id <> new.id then
      raise exception using errcode = '23514', message = 'Una riga del contratto è già in un altro contratto della ditta.';
    end if;
    select v.quantita, v.descrizione into v_tot, v_desc
      from public.order_work_phase_voci v where v.id = v_a.voce_id for update;
    select coalesce(sum(a.quantita), 0) into v_altri
      from public.subappalto_affidamenti a where a.voce_id = v_a.voce_id and a.id <> v_a.id;
    if r.quantita <= 0 or r.quantita > coalesce(v_tot, 0) - v_altri + 0.0005 then
      raise exception using errcode = '23514',
        message = format('«%s»: nel contratto %s, ma della voce restano %s (il resto è affidato ad altre ditte).',
                         left(coalesce(v_desc, ''), 80),
                         public.quantita_testo(r.quantita),
                         public.quantita_testo(greatest(coalesce(v_tot, 0) - v_altri, 0)));
    end if;
    if r.prezzo < 0 then
      raise exception using errcode = '22023', message = 'Un prezzo del contratto è negativo.';
    end if;

    update public.subappalto_affidamenti a set
      contratto_id = new.id,
      stato = 'a_contratto',
      quantita = r.quantita,
      prezzo_unitario = r.prezzo,
      origine_prezzo = case when a.prezzo_unitario is not distinct from r.prezzo then a.origine_prezzo else 'manuale' end,
      variante_id = case when a.prezzo_unitario is not distinct from r.prezzo then a.variante_id else null end,
      aggiornato_il = now()
     where a.id = r.id;
    v_presi := v_presi || r.id;
  end loop;

  -- Tolti dall'elenco: tornano in bozza (lo fa affidamento_senza_contratto_bozza).
  update public.subappalto_affidamenti a set contratto_id = null, aggiornato_il = now()
   where a.contratto_id = new.id and not (a.id = any(v_presi));

  return null;
end;
$$;
revoke all on function public.contratto_aggancia_affidamenti() from public, anon, authenticated;

drop trigger if exists contratto_aggancia_affidamenti on public.contratti_subappalto;
create trigger contratto_aggancia_affidamenti
  after insert or update of elenco_lavori on public.contratti_subappalto
  for each row execute function public.contratto_aggancia_affidamenti();
