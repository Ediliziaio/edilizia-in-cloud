-- Un rapportino può avere molte voci: l'indice unico valeva per tutte le righe
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Correzione di `20290624100000_rendiconto_prende_tutto`.
--
-- `appalto_rendiconto_un_rapportino` è unico su
--   (rapportino_id, coalesce(employee_id, zeri), maggiorazione_pct)
-- e serve alla MANODOPERA: una sola riga per rapportino, persona e
-- maggiorazione, così due approvazioni di seguito non raddoppiano la giornata.
--
-- Finché le righe nate da una voce libera avevano `rapportino_id = null`
-- l'indice non le vedeva (in un indice unico i NULL sono tutti distinti): è il
-- motivo per cui il codice originale lasciava quel campo vuoto, non una
-- distrazione. Appena la 20290624100000 ha iniziato a scrivere la provenienza,
-- due voci dello stesso rapportino sono diventate la stessa chiave
-- (rapportino, nessun dipendente, 0) e l'approvazione è fallita con
-- `duplicate key`. Visto subito provando ad approvare
-- un rapportino con due voci per 21.080 €.
--
-- Le righe da voce libera hanno già il loro guardiano:
-- `appalto_rendiconto_una_voce`, unico su voce_libera_id. Quindi qui si
-- restringe l'indice della manodopera a chi non viene da una voce.

drop index if exists public.appalto_rendiconto_un_rapportino;

create unique index if not exists appalto_rendiconto_un_rapportino
  on public.appalto_rendiconto_righe
     (rapportino_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), maggiorazione_pct)
  where rapportino_id is not null and voce_libera_id is null;
