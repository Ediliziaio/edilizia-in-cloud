-- Un rapportino con più mezzi ne perdeva tutti tranne uno
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Correzione della `20290624100100`, trovata provando il percorso
-- intero dal vivo su una commessa vera.
--
-- `appalto_rendiconto_un_rapportino` è unico su
--   (rapportino_id, coalesce(employee_id, zeri), maggiorazione_pct)
-- e serve alla MANODOPERA: una persona, una riga per rapportino.
--
-- La 20290624100100 l'aveva ristretto a `voce_libera_id is null` per lasciar
-- passare le voci. Ma le righe nate da un MEZZO hanno anch'esse
-- `voce_libera_id` nullo, `employee_id` nullo e maggiorazione 0: tre mezzi
-- sullo stesso rapportino diventano la stessa chiave, e `on conflict do
-- nothing` ne faceva entrare **uno solo**. Gli altri due sparivano senza un
-- errore — e sparivano anche dall'elenco «rimasto fuori», perché lì il mezzo
-- risulta già rendicontato.
--
-- Misurato su una giornata con tre mezzi: entravano 3 righe su 5, 130,00 €
-- invece di 240,00 €. È lo stesso difetto che questo lavoro doveva chiudere,
-- rifatto da me un passo più in là.
--
-- La condizione giusta è quella che la rete di sicurezza già usa per la
-- manodopera: `voce_libera_id is null AND mezzo_id is null`. I mezzi hanno il
-- loro guardiano, `appalto_rendiconto_un_mezzo` su (rapportino_id, mezzo_id);
-- le voci hanno `appalto_rendiconto_una_voce`.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop index if exists public.appalto_rendiconto_un_rapportino;

create unique index if not exists appalto_rendiconto_un_rapportino
  on public.appalto_rendiconto_righe
     (rapportino_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), maggiorazione_pct)
  where rapportino_id is not null
    and voce_libera_id is null
    and mezzo_id is null;
