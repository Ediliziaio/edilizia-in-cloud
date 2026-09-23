-- Una nota sola sull'opportunità: il registro (23/09/2026).
--
-- Ce n'erano due. Il campo «Note» della scheda (marketing_opportunities.notes),
-- che riempiono soprattutto i flussi automatici — moduli, lead Meta, import,
-- risposte del freddo: 6.631 scritture in 30 giorni, 11.379 opportunità con
-- testo — e il registro con data e autore (marketing_contact_notes, 20.338
-- note). Il 21/09 il campo era stato specchiato dentro la sezione Note per far
-- riemergere le note importate da GHL, e il risultato erano due riquadri per la
-- stessa cosa. Il titolare: «avere due note non va bene per niente».
--
-- Ora il campo è solo una porta d'ingresso: quello che ci finisce dentro
-- diventa una nota del registro, con la sua data, e il campo resta vuoto. Così
-- i quindici punti che lo scrivono (edge function, import, pagine) non vanno
-- toccati uno per uno, e chi legge trova tutto in un posto solo.
--
-- Nessuna automazione parte per questo: gli eventi delle opportunità scattano
-- sul cambio di stato e di fase, non sulle note (fire_marketing_automation).

create or replace function public.nota_scheda_nel_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_testo text := btrim(new.notes);
begin
  -- Nel registro il contatto è obbligatorio: senza, il testo resta dov'è.
  if new.contact_id is null then
    return null;
  end if;

  -- Stesso testo già nel registro di questa opportunità: un'automazione che
  -- riscrive la stessa nota non deve creare un doppione.
  if not exists (
    select 1
      from public.marketing_contact_notes n
     where n.opportunity_id = new.id
       and btrim(n.content) = v_testo
  ) then
    insert into public.marketing_contact_notes (contact_id, company_id, content, created_by, opportunity_id)
    values (new.contact_id, new.company_id, v_testo, auth.uid(), new.id);
  end if;

  -- Svuotare il campo fa riscattare il trigger, ma con le note vuote la
  -- condizione WHEN è falsa: niente ricorsione.
  update public.marketing_opportunities set notes = null where id = new.id;
  return null;
end;
$$;

comment on function public.nota_scheda_nel_registro() is
  'Sposta nel registro (marketing_contact_notes) il testo scritto in marketing_opportunities.notes e svuota il campo: una nota sola, con data e autore.';

drop trigger if exists trg_nota_scheda_nel_registro on public.marketing_opportunities;
create trigger trg_nota_scheda_nel_registro
  after insert or update of notes on public.marketing_opportunities
  for each row
  when (coalesce(btrim(new.notes), '') <> '')
  execute function public.nota_scheda_nel_registro();

-- Le note già scritte nelle schede si spostano a lotti, fuori da questa
-- migrazione: 11.379 righe su una tabella da 38.794 non si toccano in un'unica
-- transazione (vedi CLAUDE.md).
