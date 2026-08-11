-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Rende "dinamiche" le liste del DB freddo: ricostruisce i membri dai segmenti definiti.
create or replace function public.crm_refresh_cold_lists(p_company uuid default '00000000-0000-0000-0000-000000000001')
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r record; tot integer := 0; n integer;
begin
  for r in select * from (values
    ('🏗️ Costruzioni edili','costruzioni'),
    ('🔧 Impianti & Ristrutturazione','impianti_ristrutturazione'),
    ('🪟 Serramenti & Infissi','serramenti'),
    ('🧱 Materiali edili','materiali_edili'),
    ('⚙️ Carpenteria metallica','carpenteria_metallica'),
    ('☀️ Schermature solari','schermature'),
    ('📧 Lista email edilizia','lista_email_edilizia'),
    ('📇 CRM lead edilizia','lista_crm_lead'),
    ('🏢 Associazioni di categoria','associazione'),
    ('🤝 Distributori & Partner','distributore_partner')
  ) as t(nm, tag) loop
    delete from marketing_contact_list_members mm using marketing_contact_lists l
      where mm.list_id=l.id and l.company_id=p_company and l.name=r.nm;
    insert into marketing_contact_list_members (list_id, contact_id)
      select l.id, m.id from marketing_contact_lists l join marketing_contacts m
        on m.company_id=l.company_id and m.source_channel='cold_import' and m.deleted_at is null and m.tags @> array[r.tag]
      where l.company_id=p_company and l.name=r.nm
      on conflict (list_id, contact_id) do nothing;
  end loop;

  delete from marketing_contact_list_members mm using marketing_contact_lists l
    where mm.list_id=l.id and l.company_id=p_company and l.name='🎯 Alto valore (≥ 1 Mln €)';
  insert into marketing_contact_list_members (list_id, contact_id)
    select l.id, m.id from marketing_contact_lists l join marketing_contacts m
      on m.company_id=l.company_id and m.source_channel='cold_import' and m.deleted_at is null and m.fatturato>=1000000
    where l.company_id=p_company and l.name='🎯 Alto valore (≥ 1 Mln €)' on conflict (list_id, contact_id) do nothing;

  delete from marketing_contact_list_members mm using marketing_contact_lists l
    where mm.list_id=l.id and l.company_id=p_company and l.name='📨 Contattabili via email';
  insert into marketing_contact_list_members (list_id, contact_id)
    select l.id, m.id from marketing_contact_lists l join marketing_contacts m
      on m.company_id=l.company_id and m.source_channel='cold_import' and m.deleted_at is null and m.email is not null
    where l.company_id=p_company and l.name='📨 Contattabili via email' on conflict (list_id, contact_id) do nothing;

  select count(*) into n from marketing_contact_list_members mm
    join marketing_contact_lists l on l.id=mm.list_id
    where l.company_id=p_company and l.description like '%database freddo%';
  return n;
end $$;

-- Cron giornaliero: mantiene le liste correnti (nuovi import/conversioni entrano da soli)
select cron.schedule('crm-refresh-cold-lists', '30 4 * * *', $$select public.crm_refresh_cold_lists()$$);
