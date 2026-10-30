-- Liste fredde: si tocca solo chi entra o esce, non tutti ogni notte (31/10/2026).
--
-- crm_refresh_cold_lists (cron 04:35) cancellava e reinseriva ogni notte tutti
-- i membri delle 12 liste del database freddo: 160.987 righe, cioè 322.000
-- scritture al giorno per lasciare la lista com'era. Dal riavvio del 16/10
-- marketing_contact_list_members contava 2,26 milioni di inserimenti e
-- altrettante cancellazioni, la tabella più scritta del database. Ogni riga
-- passa dal registro (WAL) che il tempo reale deve decodificare a ogni giro,
-- e lascia righe morte da pulire.
--
-- Ora per ogni lista si toglie chi non rientra più nella condizione e si
-- aggiunge chi manca. Il risultato è lo stesso insieme di membri di prima;
-- cambia solo che added_at resta la data di ingresso vera invece di
-- diventare ogni notte le 04:35. Stesso valore di ritorno.

create or replace function public.crm_refresh_cold_lists(p_company uuid default '00000000-0000-0000-0000-000000000001'::uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; n integer;
begin
  -- tipo: 'tag' (tags contiene il valore), 'alto_valore' (fatturato ≥ 1 Mln),
  -- 'email' (ha un'email). Le condizioni sono quelle di prima, una per una.
  for r in select * from (values
    ('🏗️ Costruzioni edili','tag','costruzioni'),
    ('🔧 Impianti & Ristrutturazione','tag','impianti_ristrutturazione'),
    ('🪟 Serramenti & Infissi','tag','serramenti'),
    ('🧱 Materiali edili','tag','materiali_edili'),
    ('⚙️ Carpenteria metallica','tag','carpenteria_metallica'),
    ('☀️ Schermature solari','tag','schermature'),
    ('📧 Lista email edilizia','tag','lista_email_edilizia'),
    ('📇 CRM lead edilizia','tag','lista_crm_lead'),
    ('🏢 Associazioni di categoria','tag','associazione'),
    ('🤝 Distributori & Partner','tag','distributore_partner'),
    ('🎯 Alto valore (≥ 1 Mln €)','alto_valore',null),
    ('📨 Contattabili via email','email',null)
  ) as t(nm, tipo, tag) loop
    delete from marketing_contact_list_members mm using marketing_contact_lists l
      where mm.list_id = l.id and l.company_id = p_company and l.name = r.nm
        and not exists (
          select 1 from marketing_contacts m
           where m.id = mm.contact_id
             and m.company_id = l.company_id
             and m.source_channel = 'cold_import'
             and m.deleted_at is null
             and case r.tipo
                   when 'tag' then m.tags @> array[r.tag]
                   when 'alto_valore' then m.fatturato >= 1000000
                   else m.email is not null
                 end
        );
    insert into marketing_contact_list_members (list_id, contact_id)
      select l.id, m.id from marketing_contact_lists l join marketing_contacts m
        on m.company_id = l.company_id and m.source_channel = 'cold_import' and m.deleted_at is null
       and case r.tipo
             when 'tag' then m.tags @> array[r.tag]
             when 'alto_valore' then m.fatturato >= 1000000
             else m.email is not null
           end
      where l.company_id = p_company and l.name = r.nm
      on conflict (list_id, contact_id) do nothing;
  end loop;

  select count(*) into n from marketing_contact_list_members mm
    join marketing_contact_lists l on l.id = mm.list_id
    where l.company_id = p_company and l.description like '%database freddo%';
  return n;
end $function$;
