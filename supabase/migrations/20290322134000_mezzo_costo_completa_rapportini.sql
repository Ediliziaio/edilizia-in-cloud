-- 20290322134000_mezzo_costo_completa_rapportini.sql
--
-- Un mezzo usato in un rapportino approvato senza costo orario lascia in rapportino_mezzi_costi
-- una riga con importo NULL («costo da completare»). Ma quando poi si metteva il costo orario
-- (mezzo_costo_orario_salva) quelle righe restavano vuote: l'avviso non spariva mai e il costo
-- del mezzo non arrivava alla commessa. Demo Azienda, Demolitore Hilti, 14/11/2026.
--
-- Ora, salvato il costo, le righe ancora senza importo di quel mezzo si completano col costo
-- orario effettivo. Le righe già valorizzate non si toccano: il prezzo di un rapportino
-- approvato resta quello del giorno.

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.mezzo_costo_orario_salva(uuid,numeric,numeric)'::regprocedure);
  vecchio constant text := '    ore_annue_previste = excluded.ore_annue_previste, updated_by = excluded.updated_by, updated_at = now();
end;';
  nuovo constant text := '    ore_annue_previste = excluded.ore_annue_previste, updated_by = excluded.updated_by, updated_at = now();
  -- I rapportini rimasti senza costo per questo mezzo si completano ora (20290322134000).
  update public.rapportino_mezzi_costi q
     set costo_orario = v.costo, importo = round(q.ore * v.costo, 2)
    from (select public.mezzo_costo_orario_effettivo(p_mezzo) as costo) v
   where q.mezzo_id = p_mezzo and q.company_id = c and q.importo is null and v.costo is not null;
end;';
begin
  if position('si completano ora' in definizione) > 0 then
    return;
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'mezzo_costo_orario_salva: non trovo la fine della funzione';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;
