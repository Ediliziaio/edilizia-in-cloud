-- Applicata in produzione il 7 settembre 2026 via MCP.
--
-- Il segno di una nota di credito sta nel TIPO del documento, non negli
-- importi: `documento_segno('nota_credito')` vale -1 ed e' l'unico posto dove
-- quel segno e' scritto. La schermata pero' salvava anche gli importi
-- negativi, e cosi' il segno finiva applicato due volte.
--
-- Qui si mette una rete: la somma degli storni prende il valore assoluto,
-- quindi una nota gia' salvata con gli importi negativi non fa piu' crescere
-- il residuo invece di azzerarlo. Su una fattura da 1.220 EUR stornata per
-- intero il residuo diventava 2.440 EUR, e il ramo che marca la fattura come
-- «stornata» non scattava mai, perche' -1.220 non e' mai maggiore di 1.220.
--
-- La causa vera e' lato schermata ed e' corretta nello stesso commit
-- (src/lib/fatturazione/noteCredito.ts: gli importi si salvano positivi).
--
-- In produzione oggi non c'e' nessuna nota di credito emessa (solo bozze
-- vuote), quindi non c'e' niente da sanare: questa e' la protezione per la
-- prima che verra'.
create or replace function public.documento_stornato(p_documento_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT coalesce(sum(abs(coalesce(nc.totale_da_pagare, nc.totale_documento, 0))), 0)
    FROM public.documenti_fiscali nc
   WHERE nc.documento_correlato_id = p_documento_id
     AND nc.tipo = 'nota_credito'
     AND nc.stato NOT IN ('bozza', 'annullata')
     AND nc.deleted_at IS NULL
     AND public.user_can_access_company(nc.company_id);
$function$;

revoke all on function public.documento_stornato(uuid) from public, anon;
grant execute on function public.documento_stornato(uuid) to authenticated, service_role;
