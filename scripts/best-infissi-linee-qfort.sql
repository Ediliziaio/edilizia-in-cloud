-- ============================================================================
-- Best Infissi S.r.l. — le quattro linee Qfort
-- company_id: 421f4929-04bc-406d-b0fd-3ff4d57a64ee
--
-- DOVE VA IL TESTO, E PERCHE'
--   Verificato nel renderer PDF (src/types/serramenti.ts, sezione
--   "macro_dedicate"): il preventivo serramenti ha UNA PAGINA DEDICATA PER
--   MACROCATEGORIA, che presenta la linea con foto e descrizione estesa, e
--   viene messa PRIMA dell'allegato tecnico. Le singole famiglie compaiono
--   dopo, nell'allegato, come righe di composizione.
--
--   Quindi:
--     macrocategoria (4Stars, Epiq, ...) -> testo commerciale, e' la pagina
--                                           che il cliente legge e su cui
--                                           decide. Qui va l'impegno.
--     famiglia (Finestra 1 Anta, ...)    -> una riga tecnica e basta. In un
--                                           preventivo da otto finestre si
--                                           ripete otto volte: un paragrafo
--                                           di vendita li' e' rumore.
--
--   Oggi mostra_pagina_dedicata_pdf e' FALSE su tutte e descrizione_estesa
--   e' VUOTA: quella pagina non compare proprio. Lo script la accende.
--
-- COSA CAMBIA NELLA STRUTTURA
--   Serramenti PVC       -> rinominata 4Stars     + duplicata Epiq
--   Serramenti Alluminio -> rinominata Arrogance  + duplicata 5Stars
--   da 46 a 92 famiglie. Legno-Alluminio non si tocca: altro fornitore.
--
-- PREZZI
--   Identici fra le due linee dello stesso materiale, come indicato. Se un
--   giorno divergono, sono famiglie distinte: basta modificarne la griglia.
--
-- NIENTE DATI TECNICI INVENTATI
--   Nessuna trasmittanza, spessore o numero di guarnizioni: variano per
--   linea, non li ho da fonte Qfort e finirebbero su un preventivo firmato.
--   Vanno nelle schede prodotto (article_family_documents).
--
-- REVERSIBILE: vedi blocco 7.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. BACKUP — esegui e conserva l'output
-- ────────────────────────────────────────────────────────────────────────────
select id, nome, descrizione, descrizione_estesa, mostra_pagina_dedicata_pdf, sort_order
from listino_macrocategorie
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
order by sort_order, nome;

select f.id, f.nome, m.nome as macrocategoria, f.descrizione
from article_families f
join listino_macrocategorie m on m.id = f.macrocategoria_id
where f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and m.nome in ('Serramenti PVC', 'Serramenti Alluminio')
order by m.nome, f.nome;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. RINOMINA + PAGINA DEDICATA — le due linee esistenti
-- ────────────────────────────────────────────────────────────────────────────
update listino_macrocategorie
set nome = '4Stars',
    descrizione = 'Serramenti in PVC — linea Qfort 4Stars',
    descrizione_estesa =
      'La linea 4Stars e'' il nostro riferimento in PVC per la sostituzione dei serramenti nel residenziale, ed e'' la scelta che proponiamo piu'' spesso perche'' nella grande maggioranza delle case fa esattamente quello che serve.' || chr(10) || chr(10) ||
      'Il PVC lavora bene dove il serramento vecchio disperde: telaio e anta sono a camere multiple, con rinforzo interno in acciaio che tiene la geometria nel tempo, e la superficie non richiede manutenzione — niente da riverniciare, si pulisce e basta.' || chr(10) || chr(10) ||
      'La 4Stars e'' pensata per lasciare passare piu'' luce possibile a parita'' di foro murario: e'' il primo effetto che si nota entrando in una stanza dopo la sostituzione, prima ancora della differenza in bolletta.' || chr(10) || chr(10) ||
      'La consigliamo quando l''obiettivo e'' migliorare comfort e consumi con una spesa proporzionata, su appartamenti e villette dove non ci sono vincoli architettonici particolari e le dimensioni dei fori sono quelle standard.',
    mostra_pagina_dedicata_pdf = true,
    updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Serramenti PVC';

update listino_macrocategorie
set nome = 'Arrogance',
    descrizione = 'Serramenti in alluminio — linea Qfort Arrogance',
    descrizione_estesa =
      'Arrogance e'' la linea in alluminio a taglio termico che proponiamo quando il serramento deve reggere dimensioni importanti e allo stesso tempo farsi vedere il meno possibile.' || chr(10) || chr(10) ||
      'L''alluminio permette sezioni piu'' sottili del PVC a parita'' di solidita'': significa piu'' vetro e meno telaio nello stesso foro, quindi piu'' luce naturale in casa. E permette luci e pesi che in PVC non sarebbero realizzabili — vetrate ampie, ante alte, grandi porte finestra.' || chr(10) || chr(10) ||
      'Il taglio termico separa la parte esterna del profilo da quella interna: e'' l''accorgimento che rende l''alluminio adatto anche dove conta l''isolamento, e non solo il disegno.' || chr(10) || chr(10) ||
      'La consigliamo su ristrutturazioni di pregio, su grandi superfici vetrate e in tutti i casi in cui il serramento e'' parte del progetto architettonico e non solo un elemento da sostituire.',
    mostra_pagina_dedicata_pdf = true,
    updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Serramenti Alluminio';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. CREA le due linee nuove
--    Ereditano tipologia, colore, icona e verticali dalla gemella: devono
--    comportarsi allo stesso modo nell'interfaccia e nel PDF.
-- ────────────────────────────────────────────────────────────────────────────
insert into listino_macrocategorie
  (company_id, nome, descrizione, descrizione_estesa, categoria_tipo, tipologia,
   colore, icona, attivo, sort_order, verticali_abilitati, mostra_pagina_dedicata_pdf)
select company_id, 'Epiq',
       'Serramenti in PVC — linea Qfort Epiq',
       'Epiq e'' la linea in PVC di fascia superiore: stessa versatilita'' della 4Stars, ma costruita attorno al comfort di chi ci abita.' || chr(10) || chr(10) ||
       'La differenza si sente su due fronti. Il primo e'' il rumore: un profilo piu'' evoluto lavora meglio sull''isolamento acustico, e in casa su strada o vicino a una scuola la differenza rispetto a un serramento normale e'' immediata. Il secondo e'' la temperatura percepita vicino alla finestra, quella sensazione di aria fredda in prossimita'' del vetro che sparisce.' || chr(10) || chr(10) ||
       'A parita'' di apertura e di dimensioni, Epiq e'' la scelta di chi vuole spendere una volta sola e non tornarci sopra.' || chr(10) || chr(10) ||
       'La consigliamo dove ci sono rumore esterno, esposizioni sfavorevoli o l''obiettivo dichiarato di ridurre i consumi — e in tutte le situazioni in cui il cliente ci chiede "qual e'' la versione migliore".',
       categoria_tipo, tipologia, colore, icona, attivo, sort_order + 1,
       verticali_abilitati, true
from listino_macrocategorie
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = '4Stars'
on conflict (company_id, nome) do nothing;

insert into listino_macrocategorie
  (company_id, nome, descrizione, descrizione_estesa, categoria_tipo, tipologia,
   colore, icona, attivo, sort_order, verticali_abilitati, mostra_pagina_dedicata_pdf)
select company_id, '5Stars',
       'Serramenti in alluminio — linea Qfort 5Stars',
       '5Stars e'' la linea in alluminio dal disegno minimale: il telaio si riduce al minimo indispensabile e quello che resta e'' il vetro.' || chr(10) || chr(10) ||
       'Rispetto ad Arrogance le sezioni a vista sono ancora piu'' contenute. In un ambiente il risultato e'' che il serramento smette di essere un elemento e diventa una cornice sottile attorno al panorama: e'' la scelta di chi guarda i render prima dei preventivi.' || chr(10) || chr(10) ||
       'Resta un serramento in alluminio a taglio termico, quindi tutti i vantaggi strutturali della linea Arrogance ci sono ancora — grandi luci, ante di peso importante, tenuta nel tempo.' || chr(10) || chr(10) ||
       'La consigliamo su progetti architettonici, ville con affacci importanti e ristrutturazioni dove l''estetica del serramento e'' un requisito e non un dettaglio.',
       categoria_tipo, tipologia, colore, icona, attivo, sort_order + 1,
       verticali_abilitati, true
from listino_macrocategorie
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Arrogance'
on conflict (company_id, nome) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. DUPLICA le famiglie nelle linee nuove
--    Colonne elencate una per una: copia vertical, categoria, assi griglia,
--    unita', markup e manodopera; non copia id ne' deleted_at.
--    NB: `vertical` e' NOT NULL senza default — dimenticarla fa fallire
--    l'INSERT. Sono le uniche tre obbligatorie: company_id, vertical, nome.
--    Idempotente: rilanciarlo non crea doppioni.
-- ────────────────────────────────────────────────────────────────────────────
insert into article_families
  (company_id, vertical, macrocategoria_id, categoria_id, nome, descrizione, codice, attivo,
   griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
   manodopera_modalita, manodopera_unita, manodopera_costo_acquisto, manodopera_prezzo_vendita,
   markup_tipo, markup_valore, custom_field_values, immagine_url)
select f.company_id, f.vertical, nuova.id, f.categoria_id, f.nome, f.descrizione, f.codice, f.attivo,
       f.griglia_asse_x_label, f.griglia_asse_y_label, f.griglia_unita,
       f.manodopera_modalita, f.manodopera_unita, f.manodopera_costo_acquisto, f.manodopera_prezzo_vendita,
       f.markup_tipo, f.markup_valore, f.custom_field_values, f.immagine_url
from article_families f
join listino_macrocategorie vecchia on vecchia.id = f.macrocategoria_id
join listino_macrocategorie nuova
  on nuova.company_id = f.company_id
 and nuova.nome = case vecchia.nome when '4Stars' then 'Epiq' when 'Arrogance' then '5Stars' end
where f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and vecchia.nome in ('4Stars', 'Arrogance')
  and not exists (
    select 1 from article_families x
    where x.company_id = f.company_id and x.macrocategoria_id = nuova.id
      and x.nome = f.nome and x.deleted_at is null
  );
-- attese: 46 righe (23 Epiq + 23 5Stars)


-- ────────────────────────────────────────────────────────────────────────────
-- 4. DESCRIZIONI FAMIGLIA — una riga tecnica, niente vendita
--
--    Queste finiscono nell'allegato tecnico, ripetute per ogni serramento
--    del preventivo. Servono a dire COSA APRE E COME, in modo che il
--    cliente riconosca la riga e il commerciale scelga la famiglia giusta
--    nel builder. Il perche' comprare sta nella pagina della linea.
-- ────────────────────────────────────────────────────────────────────────────
update article_families f
set descrizione = d.testo, updated_at = now()
from (values
  ('Finestra 1 Anta',                                        'Anta unica con apertura a battente e ribalta.'),
  ('Finestra 2 Ante',                                        'Due ante: principale anta-ribalta, secondaria a battente.'),
  ('Finestra 3 Ante',                                        'Tre ante con anta-ribalta centrale.'),
  ('Finestra Wasistas',                                      'Apertura a vasistas: sola inclinazione dall''alto, nessuna rotazione laterale.'),
  ('Fisso nel Telaio',                                       'Vetro fisso montato nel telaio, senza anta. Sezione a vista minima.'),
  ('Fisso nell''Anta',                                       'Vetro fisso su anta cieca. Stessa sezione a vista delle ante apribili affiancate.'),
  ('Porta Finestra 1 Anta',                                  'Anta unica a tutta altezza, apertura a battente e ribalta.'),
  ('Porta Finestra 1 Anta con Serratura Passante',           'Anta unica a tutta altezza con serratura a chiave azionabile dai due lati.'),
  ('Porta Finestra 2 Ante',                                  'Due ante a tutta altezza a battente, passaggio libero sull''intero foro.'),
  ('Porta Finestra 2 Ante con Serratura Passante',           'Due ante a tutta altezza con serratura a chiave azionabile dai due lati.'),
  ('Porta Finestra 3 Ante',                                  'Tre ante a tutta altezza a battente.'),
  ('Alzante Scorrevole a Scomparsa',                         'Alzante scorrevole con anta a scomparsa nella muratura. Richiede vano a muro.'),
  ('Alzante Scorrevole AS + FA',                             'Alzante scorrevole: un''anta mobile e un elemento fisso affiancato.'),
  ('Alzante Scorrevole FA + AS + AS + FA',                   'Alzante scorrevole simmetrico: due ante mobili centrali e due fissi laterali.'),
  ('Porta Finestra Traslante Scorrevole 4 Ante',             'Traslante scorrevole a quattro ante, scorrimento laterale senza ingombro interno.'),
  ('Porta Finestra Traslante Scorrevole con Fisso nel Telaio','Traslante scorrevole con elemento fisso integrato nel telaio.'),
  ('Porta Finestra Traslante Scorrevole con Fisso nell''Anta','Traslante scorrevole con vetro fisso su anta cieca, sezioni a vista allineate.'),
  ('Porta Finestra Traslante Scorrevole su Parete',          'Traslante scorrevole con anta che scorre all''esterno lungo la parete.'),
  ('Slide',                                                  'Scorrevole minimale con telai a sezione ridotta.'),
  ('Slide Plus',                                             'Scorrevole minimale con prestazioni termiche superiori alla versione Slide.'),
  ('Smart Slide',                                            'Scorrevole predisposto per motorizzazione e integrazione domotica.'),
  ('Portoncino 1 Anta',                                      'Portoncino d''ingresso ad anta unica.'),
  ('Portoncino 2 Ante',                                      'Portoncino d''ingresso a due ante, secondaria apribile all''occorrenza.')
) as d(nome, testo)
-- La macrocategoria si filtra con EXISTS e non con una JOIN: in un
-- UPDATE ... FROM la tabella target (f) non e' referenziabile dentro la ON
-- di un altro join. Con la JOIN Postgres alza
-- "invalid reference to FROM-clause entry for table f".
where f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and f.nome = d.nome
  and exists (
    select 1 from listino_macrocategorie m
    where m.id = f.macrocategoria_id
      and m.nome in ('4Stars', 'Epiq', 'Arrogance', '5Stars')
  );
-- attese: 92 righe (23 tipologie x 4 linee)


-- ────────────────────────────────────────────────────────────────────────────
-- 5. VERIFICA
-- ────────────────────────────────────────────────────────────────────────────
select m.nome as linea,
       m.mostra_pagina_dedicata_pdf as pagina_pdf,
       length(coalesce(m.descrizione_estesa, '')) as caratteri_pagina,
       count(f.id) as famiglie,
       count(*) filter (where f.attivo) as attive,
       round(avg(length(coalesce(f.descrizione, '')))) as media_car_riga_tecnica,
       count(*) filter (where f.markup_tipo = 'percentuale' and f.markup_valore = 100) as markup_x2
from listino_macrocategorie m
left join article_families f on f.macrocategoria_id = m.id and f.deleted_at is null
where m.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and m.nome in ('4Stars', 'Epiq', 'Arrogance', '5Stars', 'Serramenti Legno-Alluminio')
group by m.nome, m.mostra_pagina_dedicata_pdf, m.descrizione_estesa
order by m.nome;
-- atteso: 4 linee Qfort con pagina_pdf = true, ~900-1100 caratteri di
--         presentazione, 23 famiglie ciascuna con righe tecniche brevi
--         (media 60-90 caratteri) e markup x2.
--         Legno-Alluminio invariata: pagina_pdf false, markup none.


-- ────────────────────────────────────────────────────────────────────────────
-- 6. DOPO — allineare la griglia fra linee gemelle
--    Da eseguire quando avrai caricato i prezzi su 4Stars e Arrogance.
-- ────────────────────────────────────────────────────────────────────────────
-- insert into listino_griglia
--   (company_id, family_id, valore_x, valore_y, prezzo_acquisto, prezzo_vendita, axis_config, note)
-- select g.company_id, dest.id, g.valore_x, g.valore_y, g.prezzo_acquisto, g.prezzo_vendita, g.axis_config, g.note
-- from listino_griglia g
-- join article_families src on src.id = g.family_id
-- join listino_macrocategorie m_src on m_src.id = src.macrocategoria_id
-- join listino_macrocategorie m_dst
--   on m_dst.company_id = src.company_id
--  and m_dst.nome = case m_src.nome when '4Stars' then 'Epiq' when 'Arrogance' then '5Stars' end
-- join article_families dest
--   on dest.macrocategoria_id = m_dst.id and dest.nome = src.nome and dest.deleted_at is null
-- where g.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
--   and m_src.nome in ('4Stars', 'Arrogance')
--   and not exists (
--     select 1 from listino_griglia x
--     where x.family_id = dest.id and x.valore_x = g.valore_x and x.valore_y = g.valore_y
--   );


-- ────────────────────────────────────────────────────────────────────────────
-- 7. ROLLBACK
-- ────────────────────────────────────────────────────────────────────────────
-- update article_families f set deleted_at = now()
-- from listino_macrocategorie m
-- where m.id = f.macrocategoria_id
--   and f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
--   and m.nome in ('Epiq', '5Stars');
--
-- delete from listino_macrocategorie
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome in ('Epiq', '5Stars');
--
-- update listino_macrocategorie
-- set nome = 'Serramenti PVC', descrizione_estesa = null, mostra_pagina_dedicata_pdf = false
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = '4Stars';
-- update listino_macrocategorie
-- set nome = 'Serramenti Alluminio', descrizione_estesa = null, mostra_pagina_dedicata_pdf = false
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Arrogance';
--
-- -- le descrizioni famiglia si ripristinano dall'output del blocco 0


-- ════════════════════════════════════════════════════════════════════════════
-- 8. DESCRIZIONI DI LINEA — versione con i dati tecnici Qfort
--
--    Sostituisce i testi del blocco 1 e 2. Quelli erano qualitativi ("linea
--    di fascia superiore"); questi contengono le specifiche prese dalle
--    schede tecniche pubblicate su qfort.it e verificate nel contesto della
--    pagina, non da un riassunto:
--
--      4Stars    profondita' 70 mm, 5 camere telaio+anta, rinforzo in acciaio
--      Epiq      profondita' 76 mm, 6 camere telaio+anta, 3 guarnizioni
--      Arrogance profondita' di soli 65 mm
--      5Stars    vetrocamera da 24 a 50 mm, cerniere a scomparsa
--
--    Serve a rendere confrontabile la differenza di prezzo fra le linee: un
--    cliente che ha due preventivi davanti vede da dove viene, invece di
--    leggere due aggettivi.
--
--    NIENTE Uw: la pagina 4Stars lo dichiara "calcolato per vetrocamera con
--    Ug = 1,0", cioe' dipende dal vetro scelto. In un preventivo senza la
--    vetrata specificata sarebbe un numero contestabile.
--
--    Il testo NON e' copiato da Qfort: sono i fatti tecnici, riscritti nella
--    voce di Best Infissi.
-- ════════════════════════════════════════════════════════════════════════════

update listino_macrocategorie set descrizione_estesa =
      'La linea 4Stars e'' il nostro riferimento in PVC per la sostituzione dei serramenti nel residenziale, ed e'' la scelta che proponiamo piu'' spesso: nella grande maggioranza delle case fa esattamente quello che serve.' ||
      chr(10) || chr(10) ||
      'Il profilo ha una profondita'' di montaggio di 70 mm e cinque camere sia nel telaio sia nell''anta: sono le camere d''aria a fare l''isolamento, ed e'' li'' che si vede la differenza rispetto a un serramento di vent''anni fa. All''interno corre un rinforzo in acciaio zincato che tiene la geometria nel tempo — un''anta che non si abbassa e continua a chiudere bene anche fra dieci anni.' ||
      chr(10) || chr(10) ||
      'Il PVC non richiede manutenzione: niente da riverniciare, si pulisce e basta. E la 4Stars e'' disegnata per lasciare passare piu'' luce possibile a parita'' di foro murario: e'' il primo effetto che si nota entrando in una stanza dopo la sostituzione, prima ancora della differenza in bolletta.' ||
      chr(10) || chr(10) ||
      'La consigliamo quando l''obiettivo e'' migliorare comfort e consumi con una spesa proporzionata, su appartamenti e villette senza vincoli architettonici particolari.',
    mostra_pagina_dedicata_pdf = true, updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = '4Stars';

update listino_macrocategorie set descrizione_estesa =
      'Epiq e'' la linea in PVC di fascia superiore: stessa versatilita'' della 4Stars, ma costruita attorno al comfort di chi ci abita.' ||
      chr(10) || chr(10) ||
      'La differenza e'' nel profilo. Profondita'' di montaggio 76 mm contro 70, sei camere invece di cinque sia nel telaio sia nell''anta, pareti piu'' spesse e tre guarnizioni coestruse. Ogni guarnizione in piu'' e'' una barriera in piu'' contro aria e rumore.' ||
      chr(10) || chr(10) ||
      'Dove si sente, in concreto. Il rumore: in una casa su strada o vicino a una scuola il salto rispetto a un serramento normale e'' immediato. E la temperatura vicino alla finestra: quella sensazione di aria fredda in prossimita'' del vetro che con un profilo piu'' isolante sparisce.' ||
      chr(10) || chr(10) ||
      'La consigliamo dove ci sono rumore esterno, esposizioni sfavorevoli o l''obiettivo dichiarato di ridurre i consumi — e ogni volta che il cliente ci chiede qual e'' la versione migliore.',
    mostra_pagina_dedicata_pdf = true, updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Epiq';

update listino_macrocategorie set descrizione_estesa =
      'Arrogance e'' la linea in alluminio a taglio termico che proponiamo quando il serramento deve reggere dimensioni importanti e allo stesso tempo farsi vedere il meno possibile.' ||
      chr(10) || chr(10) ||
      'La profondita'' di montaggio e'' di soli 65 mm: il telaio occupa poco e il vetro occupa tanto. A parita'' di foro murario entra piu'' luce che con qualsiasi profilo in PVC, ed e'' la ragione principale per cui si sceglie l''alluminio quando l''estetica conta.' ||
      chr(10) || chr(10) ||
      'L''alluminio permette poi luci e pesi che in PVC non sarebbero realizzabili: vetrate ampie, ante alte, grandi porte finestra che restano stabili nel tempo. Il taglio termico separa la parte esterna del profilo da quella interna, ed e'' l''accorgimento che rende l''alluminio adatto anche dove conta l''isolamento e non solo il disegno.' ||
      chr(10) || chr(10) ||
      'La consigliamo su ristrutturazioni di pregio, grandi superfici vetrate e ogni volta che il serramento e'' parte del progetto architettonico e non un elemento da sostituire.',
    mostra_pagina_dedicata_pdf = true, updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Arrogance';

update listino_macrocategorie set descrizione_estesa =
      '5Stars e'' la linea in alluminio dal disegno minimale: il telaio si riduce al minimo indispensabile e quello che resta e'' il vetro.' ||
      chr(10) || chr(10) ||
      'Due dettagli fanno la differenza estetica. Le cerniere possono essere a scomparsa, quindi il serramento chiuso non mostra nessuna ferramenta. E la camera puo'' ospitare vetri da 24 fino a 50 mm: piu'' spessore significa piu'' isolamento acustico, che su una vetrata grande e'' esattamente dove si gioca il comfort.' ||
      chr(10) || chr(10) ||
      'Resta un serramento in alluminio a taglio termico, quindi tutti i vantaggi strutturali di Arrogance ci sono ancora: grandi luci, ante di peso importante, tenuta nel tempo.' ||
      chr(10) || chr(10) ||
      'La consigliamo su progetti architettonici, ville con affacci importanti e ristrutturazioni dove l''estetica del serramento e'' un requisito e non un dettaglio.',
    mostra_pagina_dedicata_pdf = true, updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = '5Stars';

-- Verifica: quattro linee, pagina PDF accesa, specifiche presenti.
select nome, length(descrizione_estesa) as caratteri, mostra_pagina_dedicata_pdf as pdf,
       case when descrizione_estesa like '%mm%' then 'sì' else 'NO' end as dati_tecnici
from listino_macrocategorie
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and nome in ('4Stars','Epiq','Arrogance','5Stars')
order by nome;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. ASSI E VALORI — il pezzo che mancava alla duplicazione
--
--    Il blocco 3 duplicava le famiglie ma NON i loro assi. Risultato: Epiq e
--    5Stars sono nate con zero assi, quindi in preventivo non si poteva
--    scegliere ne' Colore, ne' Tipologia Vetro, ne' Finitura. Due linee
--    complete di prezzo ma inutilizzabili.
--
--    E' il secondo pezzo dimenticato dopo le colonne di prezzo: una
--    duplicazione "a mano" di una famiglia deve portarsi dietro TRE cose —
--    la riga, le colonne di prezzo, e il sottoalbero assi/valori.
--
--    NOTA: l'asse "Finitura" di 4Stars contiene gia' il PVC PELLICOLATO come
--    valore con maggiorazione fisso_mq +150 €/mq, cioe' 400 + 150 = 550, che
--    e' esattamente la voce del listino. Non serve crearlo: serviva copiarlo
--    su Epiq, cosa che questo blocco fa.
-- ════════════════════════════════════════════════════════════════════════════
insert into article_family_axes
  (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
select dest.id, x.company_id, x.nome, x.codice, x.descrizione, x.tipo, x.obbligatorio, x.sort_order
from article_family_axes x
join article_families src on src.id = x.family_id
join listino_macrocategorie m_src on m_src.id = src.macrocategoria_id
join listino_macrocategorie m_dst
  on m_dst.company_id = src.company_id
 and m_dst.nome = case m_src.nome when '4Stars' then 'Epiq' when 'Arrogance' then '5Stars' end
join article_families dest
  on dest.macrocategoria_id = m_dst.id and dest.nome = src.nome and dest.deleted_at is null
where src.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and src.deleted_at is null
  and m_src.nome in ('4Stars','Arrogance')
  and not exists (select 1 from article_family_axes y where y.family_id = dest.id and y.nome = x.nome);
-- attese: 115 righe

insert into article_family_axis_values
  (axis_id, company_id, valore, label, descrizione, is_default,
   maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto,
   sort_order, attivo, codice, prezzo_vendita, prezzo_acquisto, immagine_url)
select x_dst.id, v.company_id, v.valore, v.label, v.descrizione, v.is_default,
       v.maggiorazione_tipo, v.maggiorazione_valore, v.maggiorazione_acquisto,
       v.sort_order, v.attivo, v.codice, v.prezzo_vendita, v.prezzo_acquisto, v.immagine_url
from article_family_axis_values v
join article_family_axes x_src on x_src.id = v.axis_id
join article_families src on src.id = x_src.family_id
join listino_macrocategorie m_src on m_src.id = src.macrocategoria_id
join listino_macrocategorie m_dst
  on m_dst.company_id = src.company_id
 and m_dst.nome = case m_src.nome when '4Stars' then 'Epiq' when 'Arrogance' then '5Stars' end
join article_families dest
  on dest.macrocategoria_id = m_dst.id and dest.nome = src.nome and dest.deleted_at is null
join article_family_axes x_dst on x_dst.family_id = dest.id and x_dst.nome = x_src.nome
where src.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and src.deleted_at is null
  and m_src.nome in ('4Stars','Arrogance')
  and not exists (
    select 1 from article_family_axis_values w
    where w.axis_id = x_dst.id and w.valore = v.valore);
-- attese: 322 righe

-- Verifica: le linee gemelle devono essere simmetriche.
select m.nome as linea, count(distinct f.id) as famiglie,
       count(distinct x.id) as assi, count(v.id) as valori,
       string_agg(distinct x.nome, ', ' order by x.nome) as assi_presenti
from listino_macrocategorie m
join article_families f on f.macrocategoria_id = m.id and f.deleted_at is null
left join article_family_axes x on x.family_id = f.id
left join article_family_axis_values v on v.axis_id = x.id
where m.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and m.nome in ('4Stars','Epiq','Arrogance','5Stars')
group by m.nome order by m.nome;
-- atteso: 4Stars ed Epiq identici (69 assi, 184 valori, con Finitura),
--         Arrogance e 5Stars identici (46 assi, 138 valori).


-- ════════════════════════════════════════════════════════════════════════════
-- 10. ARCHIVIAZIONE delle famiglie orfane
--
--    23 famiglie rimaste nelle vecchie macrocategorie per TIPOLOGIA
--    (Finestre, Porte-finestra, Portoncini, Scorrevoli & Alzanti), residuo
--    della struttura precedente al passaggio alle linee.
--
--    Verificato prima di archiviare: zero utilizzi in quote_items,
--    order_items, listino_griglia, documenti, template, bundle, alias,
--    magazzino, articoli_native e accessori_progetto. Avevano solo 46 assi
--    attaccati, che con il soft delete restano al loro posto.
--
--    Soft delete e non DELETE: le FK verso article_families sono per meta'
--    in CASCADE, e una cancellazione fisica porterebbe via anche cio' che
--    un domani potrebbe servire per ricostruire uno storico.
-- ════════════════════════════════════════════════════════════════════════════
update article_families f
set deleted_at = now(), updated_at = now()
from listino_macrocategorie m
where m.id = f.macrocategoria_id
  and f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and m.nome in ('Finestre','Porte-finestra','Portoncini','Scorrevoli & Alzanti')
  and f.attivo = false
  and coalesce(f.prezzo_base_vendita, 0) = 0;
-- attese: 23 righe

-- Ripristino, se servisse: update article_families set deleted_at = null
-- where id in (...) — gli id sono nel backup /tmp/orfane-backup.json.

