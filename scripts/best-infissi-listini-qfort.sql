-- ============================================================================
-- Best Infissi S.r.l. — impostazione regole di prezzo dei due listini
-- company_id: 421f4929-04bc-406d-b0fd-3ff4d57a64ee
--
-- REGOLE DICHIARATE DAL CLIENTE (agosto 2026):
--   Prodotto : Qfort si compra a 200 €/m² e si vende a 400 €/m² → x2 (markup 100%)
--   Montaggio: si aggiunge A PARTE, non e' dentro il raddoppio
--   Il 20%   : e' il margine sulla manodopera, GIA' COMPRESO nel prezzo
--              esposto (posa 60 € => costo reale 50 €). Confermato dal
--              cliente che vale anche per smaltimento, trasporto e tiro al
--              piano: quindi tutte e 62 le voci, non solo le 46 di posa.
--   IVA      : a parte
--
-- COSA FA / COSA NON FA
--   Fa   : imposta il markup x2 sulle 46 famiglie Qfort (PVC + Alluminio)
--          e ricava il costo interno delle 46 voci di posa dal prezzo esposto.
--   NON fa: non inserisce nessun prezzo nella griglia. Il listino Qfort in
--          €/m² non e' ancora stato fornito, e i prezzi non si inventano.
--
-- FUORI AMBITO, DELIBERATAMENTE
--   - Serramenti Legno-Alluminio (23 famiglie): altro fornitore, markup ignoto.
--   (Le 16 voci smaltimento/trasporto/tiro al piano erano inizialmente fuori
--   ambito; il cliente ha poi confermato che il 20% vale anche per quelle,
--   quindi ora rientrano nell'UPDATE principale.)
--
-- REVERSIBILE: prima di ogni UPDATE c'e' la query che salva lo stato attuale.
--              Eseguile e conserva l'output se vuoi poter tornare indietro.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. BACKUP DELLO STATO ATTUALE — esegui e salva l'output prima di procedere
-- ────────────────────────────────────────────────────────────────────────────
select f.id, f.nome, m.nome as macrocategoria, f.markup_tipo, f.markup_valore
from article_families f
join listino_macrocategorie m on m.id = f.macrocategoria_id
where f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and m.nome in ('Serramenti PVC', 'Serramenti Alluminio')
order by m.nome, f.nome;

select id, nome, tipo, prezzo_vendita, costo_interno
from tariffe_aziendali
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and tipo = 'posa'
order by nome;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. PRODOTTI — markup x2 sulle famiglie Qfort
--
--    markup_tipo = 'percentuale' significa: vendita = acquisto x (1 + valore/100).
--    Con valore = 100 -> vendita = acquisto x 2, che e' esattamente
--    "compro a 200, vendo a 400".
--
--    Effetto pratico: quando inserirai i prezzi d'acquisto Qfort nella
--    griglia, il prezzo di vendita si calcola da solo. Senza questa riga
--    resterebbero uguali al costo.
-- ────────────────────────────────────────────────────────────────────────────
update article_families f
set markup_tipo  = 'percentuale',
    markup_valore = 100,
    updated_at   = now()
from listino_macrocategorie m
where m.id = f.macrocategoria_id
  and f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and m.nome in ('Serramenti PVC', 'Serramenti Alluminio');
-- attese: 46 righe


-- ────────────────────────────────────────────────────────────────────────────
-- 2. MANODOPERA — ricava il costo dal prezzo di posa
--
--    Il prezzo esposto comprende gia' il 20% di margine, quindi il costo si
--    ottiene DIVIDENDO per 1,20 e non sottraendo il 20%:
--        posa 60 € -> 60 / 1,20 = 50 €      (corretto)
--        posa 60 € -> 60 - 20%  = 48 €      (sbagliato)
--    E' l'errore aritmetico piu' comune su questo tipo di ricarico.
--
--    Oggi tutte le 62 voci hanno prezzo di vendita ma nessun costo: il
--    margine sulla posa non e' calcolabile da nessuna parte nel gestionale.
--    NB: la tabella non ha updated_at, quindi non c'e' da aggiornare.
-- ────────────────────────────────────────────────────────────────────────────
update tariffe_aziendali
set costo_interno = round((prezzo_vendita / 1.20)::numeric, 2)
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and coalesce(prezzo_vendita, 0) > 0;
-- attese: 62 righe (46 posa + 8 smaltimento + 7 tiro al piano + 1 trasporto)


-- ────────────────────────────────────────────────────────────────────────────
-- 3. VERIFICA — esegui dopo gli UPDATE
-- ────────────────────────────────────────────────────────────────────────────
select 'famiglie Qfort con markup x2' as controllo,
       count(*) as valore,
       '46 attese' as atteso
from article_families f
join listino_macrocategorie m on m.id = f.macrocategoria_id
where f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and m.nome in ('Serramenti PVC', 'Serramenti Alluminio')
  and f.markup_tipo = 'percentuale' and f.markup_valore = 100

union all

select 'legno-alluminio NON toccate', count(*), '23 attese, markup ancora none'
from article_families f
join listino_macrocategorie m on m.id = f.macrocategoria_id
where f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and f.deleted_at is null
  and m.nome = 'Serramenti Legno-Alluminio'
  and f.markup_tipo = 'none'

union all

select 'voci manodopera con costo', count(*), '62 attese'
from tariffe_aziendali
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and coalesce(costo_interno, 0) > 0

union all

select 'margine fuori dal 20%', count(*), '0 attese'
from tariffe_aziendali
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and coalesce(costo_interno, 0) > 0
  and abs(round(((prezzo_vendita - costo_interno) / costo_interno * 100)::numeric, 1) - 20.0) > 0.5;


-- Controllo a campione: le prime dieci voci di posa con il margine calcolato.
select nome,
       prezzo_vendita as vendita,
       costo_interno  as costo,
       round(((prezzo_vendita - costo_interno) / costo_interno * 100)::numeric, 1) as margine_pct
from tariffe_aziendali
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
order by tipo, nome
limit 12;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. PREZZI AL MQ — costo d'acquisto = meta' del prezzo di vendita
--
--    Il listino del cliente (PVC 400, alluminio 800, legno-alluminio 800,
--    tapparelle 100 e 60, cassonetto 120/ml, zanzariere 160 e 100, inferriata
--    450) e' un listino di VENDITA. Lo si capisce da due riscontri
--    indipendenti: gli accessori avevano gia' quei numeri esatti in
--    prezzo_base_vendita, e il PVC a 400 coincide con l'esempio dato a voce
--    ("io vendo a 400 al mq, qfort lo compro a 200").
--
--    Il x2 vale su TUTTO il listino, non solo sui serramenti Qfort:
--    confermato dal cliente anche per cassonetti, zanzariere, inferriate e
--    legno-alluminio. Quindi acquisto = vendita / 2 ovunque.
--
--    Senza questa riga prezzo_base_acquisto resta a 0 e la marginalita' non
--    e' calcolabile da nessuna parte nel gestionale — che e' esattamente lo
--    stato in cui era il listino prima.
-- ────────────────────────────────────────────────────────────────────────────
update article_families
set prezzo_base_acquisto = round((prezzo_base_vendita / 2)::numeric, 2), updated_at = now()
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
  and deleted_at is null
  and coalesce(prezzo_base_vendita, 0) > 0;
-- attese: 122 righe

-- Controllo: nessuna famiglia deve avere un margine diverso dal 100%.
select count(*) as fuori_dal_100_pct
from article_families
where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee' and deleted_at is null
  and coalesce(prezzo_base_vendita, 0) > 0
  and abs(prezzo_base_vendita - prezzo_base_acquisto * 2) > 0.01;
-- atteso: 0


-- ────────────────────────────────────────────────────────────────────────────
-- 5. ROLLBACK, se serve tornare indietro
-- ────────────────────────────────────────────────────────────────────────────
-- update article_families f
-- set markup_tipo = 'none', markup_valore = 0, updated_at = now()
-- from listino_macrocategorie m
-- where m.id = f.macrocategoria_id
--   and f.company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee'
--   and m.nome in ('Serramenti PVC', 'Serramenti Alluminio');
--
-- update tariffe_aziendali set costo_interno = null
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee';
--
-- update article_families set prezzo_base_acquisto = 0
-- where company_id = '421f4929-04bc-406d-b0fd-3ff4d57a64ee';
