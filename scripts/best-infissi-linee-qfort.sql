-- ============================================================================
-- Best Infissi S.r.l. — le quattro linee Qfort
-- company_id: 421f4929-04bc-406d-b0fd-3ff4d57a64ee
--
-- COSA CAMBIA
--   Oggi il listino e' organizzato per MATERIALE: "Serramenti PVC" e
--   "Serramenti Alluminio", 23 famiglie ciascuna. Ma Best Infissi non vende
--   "il PVC": vende 4Stars ed Epiq in PVC, Arrogance e 5Stars in alluminio.
--   Un commerciale che apre il listino deve vedere il nome che dice al
--   cliente, non il materiale.
--
--   Serramenti PVC        -> rinominata  4Stars        (23 famiglie, restano)
--                         -> duplicata   Epiq          (23 famiglie nuove)
--   Serramenti Alluminio  -> rinominata  Arrogance     (23 famiglie, restano)
--                         -> duplicata   5Stars        (23 famiglie nuove)
--
--   Totale: da 46 a 92 famiglie sulle linee Qfort.
--
--   Serramenti Legno-Alluminio NON si tocca: altro fornitore.
--
-- PREZZI
--   Identici fra le due linee dello stesso materiale, come indicato dal
--   cliente. La duplicazione copia anche markup e configurazione griglia,
--   quindi le linee nuove nascono gia' allineate. Se in futuro Epiq e 5Stars
--   avranno prezzi propri, basta modificarne la griglia: sono famiglie
--   distinte, non alias.
--
-- DESCRIZIONI
--   Riscritte tutte e 23, e sono le stesse per le quattro linee perche'
--   descrivono la TIPOLOGIA (cosa apre, come, dove si usa), che non cambia
--   fra PVC e alluminio.
--   NON contengono valori di trasmittanza, spessori o numero di guarnizioni:
--   quelli variano per linea e non li ho da fonte Qfort. Inventarli su un
--   documento che finisce in un preventivo firmato non e' accettabile.
--   Vanno nelle schede prodotto (article_family_documents), come da tua nota.
--
-- REVERSIBILE: vedi blocco 6 in fondo.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. BACKUP — esegui e conserva l'output
-- ────────────────────────────────────────────────────────────────────────────
select id, nome, descrizione, sort_order, attivo
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
-- 1. RINOMINA le due macrocategorie esistenti
--    Il materiale non si perde: finisce nella descrizione.
-- ────────────────────────────────────────────────────────────────────────────
update listino_macrocategorie
set nome = '4Stars',
    descrizione = 'Serramenti in PVC Qfort — linea 4Stars',
    descrizione_estesa = 'Linea in PVC della gamma Qfort. Profilo multicamera con rinforzo interno in acciaio, ottimo rapporto fra isolamento termico e prezzo: e'' la scelta di riferimento per la sostituzione serramenti nel residenziale. Disponibile in tutte le tipologie di apertura, dalla finestra a un''anta all''alzante scorrevole.',
    updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Serramenti PVC';

update listino_macrocategorie
set nome = 'Arrogance',
    descrizione = 'Serramenti in alluminio Qfort — linea Arrogance',
    descrizione_estesa = 'Linea in alluminio a taglio termico della gamma Qfort. Profili sottili e sezioni a vista ridotte: massimizza la superficie vetrata e quindi la luce naturale, e regge luci e pesi che il PVC non permette. E'' la linea da proporre su grandi vetrate, ristrutturazioni di pregio e progetti dove conta il disegno del serramento.',
    updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Serramenti Alluminio';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. CREA le due macrocategorie nuove
--    Ereditano tipologia, colore, icona e verticali dalla linea gemella:
--    devono comportarsi allo stesso modo nell'interfaccia.
-- ────────────────────────────────────────────────────────────────────────────
insert into listino_macrocategorie
  (company_id, nome, descrizione, descrizione_estesa, categoria_tipo, tipologia,
   colore, icona, attivo, sort_order, verticali_abilitati, mostra_pagina_dedicata_pdf)
select company_id,
       'Epiq',
       'Serramenti in PVC Qfort — linea Epiq',
       'Linea in PVC di fascia superiore della gamma Qfort. Rispetto alla 4Stars punta sul comfort abitativo: profilo piu' || ' evoluto per isolamento termico e acustico, pensato per chi vuole ridurre i consumi e il rumore esterno. Stessa versatilita' || ' di aperture, resa estetica piu' || ' curata.',
       categoria_tipo, tipologia, colore, icona, attivo, sort_order + 1,
       verticali_abilitati, mostra_pagina_dedicata_pdf
from listino_macrocategorie
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = '4Stars'
on conflict (company_id, nome) do nothing;

insert into listino_macrocategorie
  (company_id, nome, descrizione, descrizione_estesa, categoria_tipo, tipologia,
   colore, icona, attivo, sort_order, verticali_abilitati, mostra_pagina_dedicata_pdf)
select company_id,
       '5Stars',
       'Serramenti in alluminio Qfort — linea 5Stars',
       'Linea in alluminio dal disegno minimale della gamma Qfort. Sezioni a vista ancora piu' || ' contenute rispetto ad Arrogance, per un serramento che quasi sparisce e lascia parlare il vetro. Indicata su progetti architettonici, ampie superfici vetrate e contesti dove il telaio deve farsi notare il meno possibile.',
       categoria_tipo, tipologia, colore, icona, attivo, sort_order + 1,
       verticali_abilitati, mostra_pagina_dedicata_pdf
from listino_macrocategorie
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Arrogance'
on conflict (company_id, nome) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. DUPLICA le famiglie nelle due linee nuove
--
--    INSERT ... SELECT con l'elenco esplicito delle colonne: copia tutto
--    (categoria, assi della griglia, unita', markup, manodopera, campi
--    custom) tranne id/date, che si rigenerano. Elencarle invece di usare
--    una scorciatoia serve a non copiare per sbaglio id o deleted_at.
--
--    NB: non copia le righe di listino_griglia, che oggi sono zero. Quando
--    caricherai i prezzi, andranno inseriti anche per Epiq e 5Stars: il
--    blocco 5 contiene la query per allinearli in un colpo solo.
-- ────────────────────────────────────────────────────────────────────────────
insert into article_families
  (company_id, macrocategoria_id, categoria_id, nome, descrizione, codice, attivo,
   griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
   manodopera_modalita, manodopera_unita, manodopera_costo_acquisto, manodopera_prezzo_vendita,
   markup_tipo, markup_valore, custom_field_values, immagine_url)
select f.company_id, nuova.id, f.categoria_id, f.nome, f.descrizione, f.codice, f.attivo,
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
  -- idempotente: se lo rilanci non crea doppioni
  and not exists (
    select 1 from article_families x
    where x.company_id = f.company_id
      and x.macrocategoria_id = nuova.id
      and x.nome = f.nome
      and x.deleted_at is null
  );
-- attese: 46 righe (23 Epiq + 23 5Stars)


-- ────────────────────────────────────────────────────────────────────────────
-- 4. DESCRIZIONI — riscritte per tutte e 23 le tipologie, su tutte e 4 le linee
--
--    Le vecchie erano etichette ("Finestra ad anta unica anta-ribalta."):
--    dicono cosa e' a chi lo sa gia'. Queste dicono anche a cosa serve e
--    quando proporla, perche' finiscono sotto gli occhi del cliente nel PDF
--    del preventivo.
-- ────────────────────────────────────────────────────────────────────────────
update article_families f
set descrizione = d.testo, updated_at = now()
from (values
  ('Finestra 1 Anta',
   'Finestra a una sola anta con apertura anta-ribalta: ruota lateralmente per pulire e affacciarsi, si inclina in alto per arieggiare senza spalancare. E'' la tipologia piu'' diffusa nel residenziale, adatta a bagni, cucine e camere dove lo spazio interno per l''anta aperta e'' limitato.'),
  ('Finestra 2 Ante',
   'Finestra a due ante, con l''anta principale anta-ribalta e la seconda apribile a battente. Libera tutta la luce del foro quando serve — utile per passare oggetti o pulire dall''interno — e permette la microventilazione su una sola anta. Soluzione standard per soggiorni e camere con fori di larghezza media.'),
  ('Finestra 3 Ante',
   'Finestra a tre ante con anta-ribalta centrale. Nasce per fori larghi dove due ante risulterebbero troppo pesanti e ingombranti da manovrare: dividendo la superficie in tre si mantengono ante leggere e maneggevoli. Da valutare quando la larghezza supera quella gestibile con due ante.'),
  ('Finestra Wasistas',
   'Finestra con sola apertura a vasistas: si inclina verso l''interno dalla parte alta e non ruota lateralmente. Serve dove non c''e'' spazio per un''anta che si apre del tutto — sopra un piano cottura, in un bagno cieco, in un vano scala — e garantisce comunque il ricambio d''aria in sicurezza, anche in presenza di bambini.'),
  ('Fisso nel Telaio',
   'Elemento vetrato fisso, senza anta apribile, montato direttamente nel telaio. Il vetro arriva quasi al bordo del serramento e la sezione a vista resta minima: e'' la soluzione che porta piu'' luce a parita'' di foro. Da usare dove l''apertura non serve e conta la superficie vetrata.'),
  ('Fisso nell''Anta',
   'Elemento fisso realizzato con un''anta cieca bloccata sul telaio. Rispetto al fisso nel telaio ha una sezione a vista maggiore, ma il vantaggio e'' estetico: affiancato a un''anta apribile, i due elementi risultano identici e la finestra appare simmetrica. Si sceglie quando conta l''allineamento visivo.'),
  ('Porta Finestra 1 Anta',
   'Porta finestra a una sola anta con apertura anta-ribalta. Consente il passaggio verso balcone o terrazzo e, in posizione ribalta, l''areazione a serramento chiuso. Adatta a balconi di servizio e a fori dove non serve un''apertura ampia.'),
  ('Porta Finestra 1 Anta con Serratura Passante',
   'Porta finestra a un''anta con serratura passante, azionabile con la chiave da entrambi i lati. E'' la versione da usare quando si esce su un terrazzo o un giardino e si vuole poter richiudere dall''esterno: risolve il problema di restare chiusi fuori e aggiunge un livello di sicurezza sull''accesso.'),
  ('Porta Finestra 2 Ante',
   'Porta finestra a due ante a battente. Aperta libera l''intera luce del foro, il che la rende la scelta naturale verso terrazzi e giardini dove si passa spesso e si portano oggetti ingombranti. Richiede spazio interno per la rotazione di entrambe le ante.'),
  ('Porta Finestra 2 Ante con Serratura Passante',
   'Porta finestra a due ante con serratura passante, manovrabile con la chiave dall''esterno. Unisce il passaggio ampio delle due ante alla possibilita'' di richiudere uscendo: e'' la configurazione tipica dell''accesso principale a giardino o cortile.'),
  ('Porta Finestra 3 Ante',
   'Porta finestra a tre ante per aperture di grande larghezza. Suddividendo la superficie in tre elementi si tengono le ante leggere e manovrabili anche su fori importanti, senza ricorrere a un sistema scorrevole.'),
  ('Alzante Scorrevole a Scomparsa',
   'Alzante scorrevole con anta che scompare all''interno della muratura: aperto, il serramento e'' completamente invisibile e il passaggio verso l''esterno resta libero da telai. E'' la soluzione piu'' scenografica per unire soggiorno e terrazzo, e va prevista in fase di progetto perche'' richiede il vano a muro.'),
  ('Alzante Scorrevole AS + FA',
   'Alzante scorrevole composto da un''anta mobile e un elemento fisso affiancato. Il meccanismo di sollevamento stacca l''anta dalla guarnizione prima di farla scorrere: si muove senza sforzo anche con vetri pesanti e, richiusa, la tenuta all''aria e all''acqua e'' quella di un serramento a battente.'),
  ('Alzante Scorrevole FA + AS + AS + FA',
   'Alzante scorrevole simmetrico a quattro elementi: due ante mobili centrali che si aprono verso l''esterno e due fissi laterali. Apre il centro della vetrata lasciando il perimetro chiuso — la configurazione classica delle grandi vetrate sul giardino, dove serve un passaggio ampio e una simmetria pulita.'),
  ('Porta Finestra Traslante Scorrevole 4 Ante',
   'Traslante scorrevole a quattro ante. Le ante scorrono lateralmente senza occupare spazio interno, vantaggio decisivo quando davanti al serramento ci sono mobili o il passaggio e'' stretto. Soluzione da valutare in alternativa all''alzante su fori larghi con budget piu'' contenuto.'),
  ('Porta Finestra Traslante Scorrevole con Fisso nel Telaio',
   'Traslante scorrevole con elemento fisso integrato nel telaio. Il fisso mantiene la sezione a vista minima e massimizza la superficie vetrata sulla parte non apribile, mentre l''anta scorrevole garantisce il passaggio senza ingombro interno.'),
  ('Porta Finestra Traslante Scorrevole con Fisso nell''Anta',
   'Traslante scorrevole con vetro fisso realizzato su anta cieca. La scelta e'' estetica: parte fissa e parte mobile hanno la stessa sezione a vista, quindi la vetrata risulta visivamente regolare. Da preferire quando il serramento e'' in vista e conta l''allineamento.'),
  ('Porta Finestra Traslante Scorrevole su Parete',
   'Traslante scorrevole con anta che trasla all''esterno lungo la parete. Non richiede vano a muro come lo scomparsa, ma libera comunque tutto il passaggio: e'' il compromesso da proporre in ristrutturazione, dove intervenire sulla muratura non e'' praticabile.'),
  ('Slide',
   'Sistema scorrevole dal disegno minimale: telai ridotti al minimo e vetro protagonista. Pensato per chi vuole l''effetto della grande vetrata continua senza le opere murarie di un alzante a scomparsa. Configurazione base della famiglia scorrevoli minimal.'),
  ('Slide Plus',
   'Evoluzione del sistema Slide con prestazioni termiche superiori a parita'' di estetica minimale. E'' la versione da proporre quando la grande vetrata guarda a nord, e'' molto esposta o l''immobile ha requisiti energetici da rispettare, e la sola resa estetica non basta.'),
  ('Smart Slide',
   'Sistema scorrevole predisposto per la motorizzazione: l''anta si apre con un comando, senza sforzo fisico. Ha senso su vetrate di grandi dimensioni e peso elevato, e in tutti i casi in cui l''utilizzatore ha difficolta'' di movimento o il serramento va integrato nella domotica di casa.'),
  ('Portoncino 1 Anta',
   'Portoncino d''ingresso a un''anta. E'' il serramento su cui il cliente giudica per primo la qualita'' dell''intera fornitura: va proposto valutando insieme sicurezza della serratura, isolamento e finitura esterna, perche'' e'' l''elemento piu'' esposto e il piu'' guardato.'),
  ('Portoncino 2 Ante',
   'Portoncino d''ingresso a due ante, con anta secondaria apribile all''occorrenza. Si usa su ingressi di larghezza importante, dove una sola anta risulterebbe sproporzionata o troppo pesante, e quando serve poter allargare il passaggio per traslochi e arredi.')
) as d(nome, testo)
join listino_macrocategorie m on m.id = f.macrocategoria_id
where f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and f.nome = d.nome
  and m.nome in ('4Stars', 'Epiq', 'Arrogance', '5Stars');
-- attese: 92 righe (23 tipologie x 4 linee)


-- ────────────────────────────────────────────────────────────────────────────
-- 5. VERIFICA
-- ────────────────────────────────────────────────────────────────────────────
select m.nome as linea,
       count(f.id) as famiglie,
       count(*) filter (where f.attivo) as attive,
       count(*) filter (where length(coalesce(f.descrizione, '')) > 200) as con_descrizione_nuova,
       count(*) filter (where f.markup_tipo = 'percentuale' and f.markup_valore = 100) as con_markup_x2
from listino_macrocategorie m
left join article_families f
  on f.macrocategoria_id = m.id and f.deleted_at is null
where m.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and m.nome in ('4Stars', 'Epiq', 'Arrogance', '5Stars', 'Serramenti Legno-Alluminio')
group by m.nome
order by m.nome;
-- atteso: 23 famiglie per ognuna delle 4 linee Qfort, tutte con descrizione
--         nuova e markup x2. Legno-Alluminio invariata: 23 famiglie, markup none.


-- ────────────────────────────────────────────────────────────────────────────
-- 6. DOPO: allineare i prezzi fra le linee gemelle
--
--    Da eseguire QUANDO avrai caricato la griglia su 4Stars e Arrogance.
--    Copia le celle sulla linea gemella abbinando le famiglie per nome.
--    Prezzi identici, come da tua indicazione: se un giorno divergeranno,
--    basta non lanciarlo e modificare la griglia di Epiq/5Stars a mano.
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
-- -- 7a. elimina le famiglie duplicate (soft delete)
-- update article_families f set deleted_at = now()
-- from listino_macrocategorie m
-- where m.id = f.macrocategoria_id
--   and f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
--   and m.nome in ('Epiq', '5Stars');
--
-- -- 7b. elimina le macrocategorie nuove
-- delete from listino_macrocategorie
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome in ('Epiq', '5Stars');
--
-- -- 7c. ripristina i nomi originali
-- update listino_macrocategorie set nome = 'Serramenti PVC'
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = '4Stars';
-- update listino_macrocategorie set nome = 'Serramenti Alluminio'
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and nome = 'Arrogance';
--
-- -- 7d. le descrizioni vecchie vanno ripristinate dall'output del blocco 0
