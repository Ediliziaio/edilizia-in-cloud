-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ═══ Preventivi: "Limita visibilità ai dati assegnati" vale anche qui ═══════
-- Prima le tabelle *_progetti erano visibili a TUTTA l'azienda: un venditore
-- con only_assigned vedeva anche i preventivi (e le bozze) dei colleghi.
-- check_staff_visibility: admin sempre; staff normale sempre; only_assigned
-- solo le righe proprie (creatore; per serramenti anche consulente assegnato).
-- Bonus: i moduli passano a get_effective_company_id() (multi-azienda ok).

-- fv_progetti
drop policy if exists "co_fv_progetti_all" on public.fv_progetti;
create policy "co_fv_progetti_all" on public.fv_progetti
for all using (
  company_id = get_effective_company_id()
  and check_staff_visibility((select auth.uid()), created_by)
) with check (
  company_id = get_effective_company_id()
);

-- sr_progetti (consulente_id = venditore assegnato)
drop policy if exists "sr_progetti_select" on public.sr_progetti;
create policy "sr_progetti_select" on public.sr_progetti
for select using (
  is_super_admin()
  or (
    company_id = get_my_company_id()
    and (check_staff_visibility((select auth.uid()), created_by)
      or check_staff_visibility((select auth.uid()), consulente_id))
  )
);
drop policy if exists "sr_progetti_update" on public.sr_progetti;
create policy "sr_progetti_update" on public.sr_progetti
for update using (
  is_super_admin()
  or (
    company_id = get_my_company_id()
    and (check_staff_visibility((select auth.uid()), created_by)
      or check_staff_visibility((select auth.uid()), consulente_id))
  )
) with check (
  (company_id = get_my_company_id()) or is_super_admin()
);

-- Moduli vendita: stessa regola su created_by + scope multi-azienda
do $$
declare
  t text;
begin
  foreach t in array array['rst','bgn','tet','clm','ele','idr','pav','pis']
  loop
    execute format('drop policy if exists "%s company members" on public.%I', t, t || '_progetti');
    execute format($p$
      create policy "%s company members" on public.%I
      for all using (
        company_id = get_effective_company_id()
        and check_staff_visibility((select auth.uid()), created_by)
      ) with check (
        company_id = get_effective_company_id()
      )$p$, t, t || '_progetti');
  end loop;
end;
$$;
