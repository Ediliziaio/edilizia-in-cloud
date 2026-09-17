-- Immagini dei modelli PDF di Serramenti e Fotovoltaico: da link firmato a
-- percorso del file.
--
-- Gli editor caricavano logo, copertina, foto «Chi siamo», foto delle recensioni
-- e galleria lavori nei bucket privati sr-progetti e fv-progetti, e salvavano
-- nel modello un link firmato valido un anno: allo scadere le immagini sparivano
-- dai preventivi. Dal commit che accompagna questa migrazione gli editor salvano
-- "<bucket>/<percorso>" e il file si firma al momento dell'uso
-- (supabase/functions/_shared/immaginiModelloPdf.ts). Nessun bucket diventa
-- pubblico. Qui si convertono i link già salvati: al 17/09/2026 erano 9, tutti in
-- sr_template_pdf, di 5 aziende, e il primo scadeva il 12/05/2027.
--
-- Si convertono solo i file nella cartella dell'azienda del modello. Un file di
-- un'altra azienda l'utente non lo potrebbe firmare, perché le policy dello
-- storage guardano la cartella, e l'immagine sparirebbe subito. Quei link restano
-- come sono finché valgono e vanno ricaricati dall'editor prima della scadenza.
-- Al 17/09/2026 erano i 2 di Demo Azienda 2, che puntano alla cartella di Demo
-- Azienda.
--
-- Idempotente: un percorso non è più un link firmato, quindi al secondo giro non
-- cambia nulla. Le tabelle hanno una riga per azienda e si toccano solo le righe
-- con un link da convertire.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Link firmato a un file nella cartella dell'azienda → "<bucket>/<percorso>".
-- Tutto il resto resta com'è: percorsi, immagini di serie, link di altre cartelle.
create or replace function pg_temp.immagine_come_percorso(valore text, azienda uuid)
returns text
language sql
immutable
as $$
  select case
    when valore ~ ('^https?://[^/]+/storage/v1/object/sign/(sr-progetti|fv-progetti)/'
                   || azienda::text || '/[A-Za-z0-9._/-]+[?]token=[A-Za-z0-9._-]+$')
      then regexp_replace(valore, '^https?://[^/]+/storage/v1/object/sign/([^?]+)[?].*$', '\1')
    else valore
  end
$$;

-- Lo stesso dentro una lista di oggetti (recensioni, galleria lavori, cantieri).
create or replace function pg_temp.lista_con_percorsi(lista jsonb, campo text, azienda uuid)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(lista) = 'array' then (
      select coalesce(jsonb_agg(
               case
                 when jsonb_typeof(voce -> campo) = 'string'
                   then jsonb_set(voce, array[campo], to_jsonb(pg_temp.immagine_come_percorso(voce ->> campo, azienda)))
                 else voce
               end
               order by posizione), '[]'::jsonb)
      from jsonb_array_elements(lista) with ordinality as e(voce, posizione)
    )
    else lista
  end
$$;

update public.sr_template_pdf t
set logo_url              = pg_temp.immagine_come_percorso(t.logo_url, t.company_id),
    chi_siamo_foto_url    = pg_temp.immagine_come_percorso(t.chi_siamo_foto_url, t.company_id),
    pdf_cover_image_url   = pg_temp.immagine_come_percorso(t.pdf_cover_image_url, t.company_id),
    pdf_cover_logo_url    = pg_temp.immagine_come_percorso(t.pdf_cover_logo_url, t.company_id),
    testimonianze_default = pg_temp.lista_con_percorsi(t.testimonianze_default, 'foto_url', t.company_id),
    gallery_lavori        = pg_temp.lista_con_percorsi(t.gallery_lavori, 'url', t.company_id)
where concat_ws(' ', t.logo_url, t.chi_siamo_foto_url, t.pdf_cover_image_url, t.pdf_cover_logo_url,
                t.testimonianze_default::text, t.gallery_lavori::text)
      ~ ('/storage/v1/object/sign/(sr-progetti|fv-progetti)/' || t.company_id::text || '/');

update public.fv_template_pdf t
set logo_url            = pg_temp.immagine_come_percorso(t.logo_url, t.company_id),
    pdf_cover_image_url = pg_temp.immagine_come_percorso(t.pdf_cover_image_url, t.company_id),
    pdf_cover_logo_url  = pg_temp.immagine_come_percorso(t.pdf_cover_logo_url, t.company_id),
    foto_team_url       = pg_temp.immagine_come_percorso(t.foto_team_url, t.company_id),
    recensioni          = pg_temp.lista_con_percorsi(t.recensioni, 'foto_url', t.company_id),
    gallery_lavori      = pg_temp.lista_con_percorsi(t.gallery_lavori, 'url', t.company_id),
    cantieri_galleria   = pg_temp.lista_con_percorsi(t.cantieri_galleria, 'foto_url', t.company_id)
where concat_ws(' ', t.logo_url, t.pdf_cover_image_url, t.pdf_cover_logo_url, t.foto_team_url,
                t.recensioni::text, t.gallery_lavori::text, t.cantieri_galleria::text)
      ~ ('/storage/v1/object/sign/(sr-progetti|fv-progetti)/' || t.company_id::text || '/');

-- Nella cartella dell'azienda non deve restare nessun link firmato. Se ne resta
-- uno, il percorso ha un formato inatteso: meglio fermarsi e guardarlo.
do $$
begin
  if exists (
    select 1 from public.sr_template_pdf t
    where concat_ws(' ', t.logo_url, t.chi_siamo_foto_url, t.pdf_cover_image_url, t.pdf_cover_logo_url,
                    t.testimonianze_default::text, t.gallery_lavori::text)
          ~ ('/storage/v1/object/sign/(sr-progetti|fv-progetti)/' || t.company_id::text || '/')
  ) or exists (
    select 1 from public.fv_template_pdf t
    where concat_ws(' ', t.logo_url, t.pdf_cover_image_url, t.pdf_cover_logo_url, t.foto_team_url,
                    t.recensioni::text, t.gallery_lavori::text, t.cantieri_galleria::text)
          ~ ('/storage/v1/object/sign/(sr-progetti|fv-progetti)/' || t.company_id::text || '/')
  ) then
    raise exception 'Restano link firmati nella cartella dell''azienda del modello: formato inatteso, controllare prima di riprovare';
  end if;
end $$;
