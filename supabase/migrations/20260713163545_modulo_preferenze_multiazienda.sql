-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Preferenze visibilità moduli vendita: la policy usava get_user_company_id
-- (= solo azienda del profilo) → un utente multi-azienda nella SECONDA azienda
-- leggeva zero righe, quindi nessun modulo risultava "nascosto" e il menu
-- Nuovo Preventivo mostrava tipi che l'azienda aveva disattivato.
drop policy if exists "cmp company members" on public.company_modulo_preferenze;
create policy "cmp company members" on public.company_modulo_preferenze
for all using (
  company_id = get_effective_company_id()
) with check (
  company_id = get_effective_company_id()
);
