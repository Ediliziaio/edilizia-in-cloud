-- commessa_salva scavalcava il controllo di modifica concorrente.
--
-- La protezione esisteva gia': il trigger `versione_riga` su orders, quotes,
-- profiles e documenti_fiscali rifiuta un UPDATE che porta una `version` diversa
-- da quella sulla riga. Funziona perche' la scheda rimanda indietro il numero
-- che aveva quando l'ha caricata: se nel frattempo qualcun altro ha salvato,
-- l'UPDATE si ferma.
--
-- `commessa_salva`, pero', quel numero non lo tocca: ricostruisce la riga con
-- jsonb_populate_record, quindi NEW.version esce identica a OLD.version e il
-- trigger non ha niente da confrontare. Passando dalla funzione, il controllo
-- semplicemente non c'era. Chi salva per ultimo cancellava il lavoro dell'altro
-- senza che nessuno dei due lo sapesse.
--
-- Ora la funzione accetta un settimo argomento, `p_versione`: la versione che la
-- scheda aveva in mano. Lasciarlo a NULL mantiene il comportamento di prima,
-- cosi' l'interfaccia puo' adottarlo quando vuole.
--
-- Nota su un mio errore, perche' resti scritto: avevo prima aggiunto una colonna
-- `row_version` con il suo trigger, senza accorgermi che `version` esisteva gia'
-- -- la sonda cercava 'row_version', 'versione' e 'lock_version', non 'version'.
-- Due contatori sulla stessa riga si sarebbero dati fastidio a vicenda: il mio
-- vedeva cambiare `version` e considerava la riga modificata anche quando non lo
-- era. Qui viene tolto tutto.

drop trigger if exists zz_versione_avanza on public.orders;
drop trigger if exists zz_versione_avanza on public.quotes;
drop function if exists public.versione_avanza();
drop function if exists public.versione_verifica(text, uuid, integer);
alter table public.orders drop column if exists row_version;
alter table public.quotes drop column if exists row_version;

do $$
declare v_def text; v_nuovo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commessa_salva' and p.pronargs = 6;

  if v_def is null then
    -- gia' riscritta a sette argomenti da un tentativo precedente: riparto da li'
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'commessa_salva' and p.pronargs = 7;
    if v_def is null then
      raise exception 'commessa_salva non trovata';
    end if;
    v_nuovo := replace(v_def, 'o.row_version into v_company, v_codice, v_ver',
                              'o.version into v_company, v_codice, v_ver');
  else
    v_nuovo := replace(v_def,
      ' p_venditore jsonb DEFAULT NULL::jsonb)',
      ' p_venditore jsonb DEFAULT NULL::jsonb, p_versione integer DEFAULT NULL::integer)');
    v_nuovo := replace(v_nuovo, '  v_attore     uuid;', '  v_attore     uuid;
  v_ver        integer;');
    v_nuovo := replace(v_nuovo,
      'select o.company_id, o.order_code into v_company, v_codice',
      'select o.company_id, o.order_code, o.version into v_company, v_codice, v_ver');
    v_nuovo := replace(v_nuovo,
      '  v_attore := auth.uid();',
      '  -- Stesso controllo del trigger versione_riga, che passando di qui non
  -- scatterebbe: la funzione non tocca `version`, quindi il trigger non
  -- vedrebbe alcuna differenza da confrontare.
  if p_versione is not null and v_ver <> p_versione then
    raise exception ''Questa commessa e'''' stata modificata da qualcun altro mentre la stavi aprendo (versione % invece di %). Ricarica e riprova: sovrascrivere cancellerebbe il lavoro dell''''altra persona.'',
      v_ver, p_versione using errcode = ''40001'';
  end if;

  v_attore := auth.uid();');
  end if;

  if position('p_versione integer' in v_nuovo) = 0
     or position('o.version into v_company' in v_nuovo) = 0
     or position('p_versione is not null and v_ver' in v_nuovo) = 0
     or position('row_version' in v_nuovo) > 0 then
    raise exception 'la riscrittura di commessa_salva non ha agganciato tutti i punti';
  end if;

  execute v_nuovo;
  drop function if exists public.commessa_salva(uuid, jsonb, jsonb, jsonb, jsonb, jsonb);
end $$;

revoke all on function public.commessa_salva(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, integer) from public;
grant execute on function public.commessa_salva(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, integer) to authenticated;
