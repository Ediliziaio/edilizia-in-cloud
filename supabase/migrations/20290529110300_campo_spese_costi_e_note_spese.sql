-- Dove finisce una spesa dell'operaio approvata (24/11/2026, scelta del founder: «costo del cantiere» e
-- «Tesoreria › Note spese»).
--
-- 1. Appena l'ufficio la approva (Personale › Richieste) nasce un costo in company_costs, sul cantiere se
--    c'è (entra da solo in costo_diretto e nel margine della commessa), già pagato: è uscito dalla tasca
--    dell'operaio o dalla carta dell'azienda, quindi non deve comparire tra le scadenze da pagare.
-- 2. Se l'ha pagata l'operaio di tasca sua, la spesa diventa una voce della SUA nota spese del mese in
--    Tesoreria (in bozza; se non c'è, la crea). Da lì l'ufficio segue le regole che ci sono già: invia,
--    approva, rimborsa col movimento della banca (controlla_revisione_nota_spese).
-- 3. Quando quella nota spese è rimborsata, le spese collegate passano a «rimborsata» e l'operaio riceve
--    l'avviso (trigger campo_spese_avvisi).
-- La carta aziendale non va in nota spese: non c'è niente da rimborsare.

alter table public.campo_spese
  add column if not exists company_cost_id uuid references public.company_costs(id) on delete set null,
  add column if not exists expense_report_id uuid references public.expense_reports(id) on delete set null;

create or replace function public.campo_spesa_approvata_collega()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text;
  v_tipo text := initcap(replace(new.tipo, '_', ' '));
  v_mese date := date_trunc('month', new.giorno)::date;
  v_nota uuid;
  v_costo uuid;
begin
  if not (old.stato = 'inviata' and new.stato = 'approvata') then
    return new;
  end if;

  select coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Operaio')
    into v_nome from public.profiles where id = new.user_id;

  -- 1. Il costo (sul cantiere, se c'è).
  if new.company_cost_id is null then
    insert into public.company_costs (
      company_id, name, cost_type, amount, recurrence, due_date, is_paid, paid_date, category, notes,
      order_id, payment_method, senza_fattura, documento_data, mese_competenza
    ) values (
      new.company_id, left(v_tipo || ' · ' || v_nome, 200), 'variable', new.importo, 'once', new.giorno, true, new.giorno,
      'spese_cantiere',
      left('Spesa dal cantiere (app operai)' || coalesce(': ' || new.descrizione, ''), 500),
      new.order_id, case when new.pagata_con = 'carta_aziendale' then 'carta' else 'contanti' end, true, new.giorno, v_mese
    ) returning id into v_costo;
    new.company_cost_id := v_costo;
  end if;

  -- 2. La nota spese del mese della persona, solo se ha pagato di tasca sua.
  if new.pagata_con = 'soldi_miei' and new.expense_report_id is null then
    select s.expense_report_id into v_nota
      from public.campo_spese s
      join public.expense_reports r on r.id = s.expense_report_id and r.status = 'draft'
     where s.company_id = new.company_id and s.user_id = new.user_id
       and date_trunc('month', s.giorno) = date_trunc('month', new.giorno)
     order by r.created_at desc
     limit 1;
    if v_nota is null then
      insert into public.expense_reports (company_id, employee_name, title, description, status, currency, period_from, period_to, notes)
      values (
        new.company_id, v_nome,
        left('Spese dal cantiere · ' || v_nome || ' · ' || to_char(v_mese, 'MM/YYYY'), 200),
        'Scontrini mandati dall''app operai e approvati in Personale › Richieste.',
        'draft', 'EUR', v_mese, (v_mese + interval '1 month - 1 day')::date, null
      ) returning id into v_nota;
    end if;
    insert into public.expense_report_items (report_id, company_id, description, category, amount, currency, expense_date, receipt_name, notes)
    values (v_nota, new.company_id, left(v_tipo || coalesce(' · ' || new.descrizione, ''), 300), new.tipo, new.importo, 'EUR', new.giorno,
            case when new.foto_path is not null then 'Scontrino nell''app operai' end,
            left('Spesa ' || new.id::text, 200));
    new.expense_report_id := v_nota;
  end if;
  return new;
end;
$$;

revoke all on function public.campo_spesa_approvata_collega() from public, anon;

drop trigger if exists trg_campo_spesa_approvata_collega on public.campo_spese;
create trigger trg_campo_spesa_approvata_collega before update of stato on public.campo_spese
  for each row execute function public.campo_spesa_approvata_collega();

-- 3. Nota spese rimborsata → le spese collegate sono rimborsate (e l'operaio lo sa).
create or replace function public.nota_spese_rimborsata_chiude_campo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'reimbursed' and old.status is distinct from 'reimbursed' then
    update public.campo_spese
       set stato = 'rimborsata', deciso_il = now(), updated_at = now(),
           deciso_da = coalesce(new.reimbursed_by, deciso_da)
     where expense_report_id = new.id and company_id = new.company_id and stato = 'approvata';
  end if;
  return new;
end;
$$;

revoke all on function public.nota_spese_rimborsata_chiude_campo() from public, anon;

drop trigger if exists trg_nota_spese_rimborsata_chiude_campo on public.expense_reports;
create trigger trg_nota_spese_rimborsata_chiude_campo after update of status on public.expense_reports
  for each row execute function public.nota_spese_rimborsata_chiude_campo();
