-- Le tipologie standard di serramento: disegni riparati e catalogo completato.
--
-- Sei modelli puntavano a immagini che non esistono (`/templates/serramenti/products/…`):
-- in produzione erano sei 404, e le stesse righe rotte erano già state copiate nei
-- listini di tre aziende. Qui le immagini tornano a un file vero, e il catalogo si
-- completa con le configurazioni che un serramentista chiede ogni giorno e che non
-- c'erano: sopraluce e sottoluce, forme speciali, scorri-ribalta, ante a libro,
-- persiane e scuri. I disegni sono generati da `scripts/genera-disegni-serramenti.mjs`.
--
-- COSTRUZIONE 17 resta nel database ma esce dal catalogo: è una riga pilota di un
-- import da listino fornitore (tag "WnD", "pilota"), senza assi, senza griglia e
-- senza immagine — chi la installava otteneva una tipologia che non calcola nulla.

-- 1. Le sei immagini rotte.
update article_family_templates
   set image_url = regexp_replace(image_url, '\.(png|jpg)$', '.svg'),
       updated_at = now()
 where image_url like '/templates/serramenti/products/%';

-- Le stesse immagini rotte sono già finite nei listini delle aziende.
update article_families
   set immagine_url = regexp_replace(immagine_url, '\.(png|jpg)$', '.svg'),
       updated_at = now()
 where immagine_url like '/templates/serramenti/products/%';

-- 2. La riga pilota esce dal catalogo installabile.
update article_family_templates
   set is_active = false, updated_at = now()
 where nome like 'COSTRUZIONE 17 IT-C1%';

-- 3. Le tipologie mancanti.
--    Gli assi sono gli stessi dei modelli già presenti — linea, colore, vetro per
--    ciò che è vetrato; solo linea e colore per gli oscuranti, dove il vetro non
--    esiste — così una tipologia nuova si comporta come le altre nel motore prezzi.
with assi_vetrate as (
  select assi_default from article_family_templates where nome = 'Finestra 2 Ante'
),
assi_oscuranti as (
  select jsonb_agg(asse) as assi_default
    from assi_vetrate, jsonb_array_elements(assi_default) as asse
   where asse->>'codice' <> 'tipologia_vetro'
),
nuove(nome, descrizione, categoria_slug, tipologia, image_url, sort_order, oscurante) as (
  values
    ('Finestra 1 Anta con Sopraluce',
     'Finestra a un''anta con sopraluce fisso sopra il traverso. Il prezzo è al metro quadro del foro finito, sopraluce compreso.',
     'infissi', 'infisso', '/templates/serramenti/finestra-1-anta-sopraluce.svg', 14, false),
    ('Finestra 1 Anta con Sottoluce',
     'Finestra a un''anta con sottoluce fisso sotto il traverso.',
     'infissi', 'infisso', '/templates/serramenti/finestra-1-anta-sottoluce.svg', 15, false),
    ('Finestra 2 Ante con Sopraluce',
     'Finestra a due ante con sopraluce fisso in unica sezione.',
     'infissi', 'infisso', '/templates/serramenti/finestra-2-ante-sopraluce.svg', 16, false),
    ('Finestra 2 Ante con Sopraluce a Due Sezioni',
     'Finestra a due ante con sopraluce diviso da un montante, allineato alle ante sottostanti.',
     'infissi', 'infisso', '/templates/serramenti/finestra-2-ante-sopraluce-due-sezioni.svg', 17, false),
    ('Finestra 2 Ante con Sottoluce',
     'Finestra a due ante con sottoluce fisso.',
     'infissi', 'infisso', '/templates/serramenti/finestra-2-ante-sottoluce.svg', 18, false),
    ('Finestra 3 Ante con Sopraluce',
     'Finestra a tre ante, quella centrale fissa, con sopraluce.',
     'infissi', 'infisso', '/templates/serramenti/finestra-3-ante-sopraluce.svg', 19, false),
    ('Porta Finestra 2 Ante con Sopraluce',
     'Porta finestra a due ante con sopraluce fisso.',
     'infissi', 'porta_finestra', '/templates/serramenti/portafinestra-2-ante-sopraluce.svg', 25, false),
    ('Porta Finestra a Libro 3 Ante',
     'Porta finestra a libro (a soffietto): le ante si impacchettano su un lato liberando quasi tutto il foro.',
     'infissi', 'libro', '/templates/serramenti/portafinestra-a-libro-3-ante.svg', 26, false),
    ('Porta Finestra a Libro 4 Ante',
     'Porta finestra a libro a quattro ante.',
     'infissi', 'libro', '/templates/serramenti/portafinestra-a-libro-4-ante.svg', 27, false),
    ('Finestra ad Arco',
     'Finestra con arco a tutto sesto nella parte alta. Il prezzo si calcola sul rettangolo che la circoscrive: la lavorazione della curva è già dentro questa tipologia.',
     'infissi', 'forma_speciale', '/templates/serramenti/finestra-arco.svg', 32, false),
    ('Finestra Tonda',
     'Oblò circolare fisso. Il prezzo si calcola sul quadrato che lo circoscrive.',
     'infissi', 'forma_speciale', '/templates/serramenti/finestra-tonda.svg', 33, false),
    ('Finestra Triangolare',
     'Finestra triangolare, tipica dei sottotetti. Prezzo sul rettangolo circoscritto.',
     'infissi', 'forma_speciale', '/templates/serramenti/finestra-triangolare.svg', 34, false),
    ('Finestra Trapezoidale',
     'Finestra trapezoidale per falde inclinate. Prezzo sul rettangolo circoscritto.',
     'infissi', 'forma_speciale', '/templates/serramenti/finestra-trapezoidale.svg', 35, false),
    ('Finestra Scorrevole 2 Ante',
     'Finestra con due ante scorrevoli in luce, senza ingombro verso l''interno.',
     'infissi', 'scorrevole', '/templates/serramenti/finestra-scorrevole-2-ante.svg', 45, false),
    ('Scorri-Ribalta PATIO',
     'Anta scorrevole in parallelo con posizione di ribalta: un''anta fissa e una mobile che si stacca dal telaio e scorre.',
     'infissi', 'scorri_ribalta', '/templates/serramenti/scorri-ribalta-patio.svg', 46, false),
    ('Persiana 1 Anta',
     'Persiana a battente a un''anta con stecche fisse o orientabili. Prezzo al metro quadro.',
     'oscuranti', 'persiana', '/templates/serramenti/persiana-1-anta.svg', 90, true),
    ('Persiana 2 Ante',
     'Persiana a battente a due ante.',
     'oscuranti', 'persiana', '/templates/serramenti/persiana-2-ante.svg', 91, true),
    ('Scuro 2 Ante',
     'Scuro (anta cieca) a due ante, pannello pieno senza stecche.',
     'oscuranti', 'scuro', '/templates/serramenti/scuro-2-ante.svg', 92, true)
)
insert into article_family_templates
  (nome, descrizione, vertical_slug, categoria_slug, tipologia, image_url,
   modalita_prezzo_base, unit_of_measure, assi_default, tags, sort_order, is_active)
select n.nome,
       n.descrizione || ' — Prezzo al metro quadro della configurazione base; le altre scelte lo modificano in percentuale.',
       'serramenti',
       n.categoria_slug,
       n.tipologia,
       n.image_url,
       'mq',
       case when n.oscurante then 'mq' else 'pz' end,
       case when n.oscurante then o.assi_default else v.assi_default end,
       array[n.tipologia, 'standard'],
       n.sort_order,
       true
  from nuove n, assi_vetrate v, assi_oscuranti o
 where not exists (
   select 1 from article_family_templates t where t.nome = n.nome
 );
