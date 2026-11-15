-- La ritenuta di garanzia dei preventivatori arriva alla commessa (15/11/2026).
--
-- Il piano di pagamento dei preventivatori ha ora la ritenuta (lib/preventivi/pianoPagamento.ts:
-- {percentuale, svincolo: collaudo|mesi, mesi}). converti_modulo_commessa_atomic, che crea la commessa
-- dal preventivo accettato, la scrive in orders.ritenuta_garanzia, da dove la legge il certificato del SAL.
-- Come per il computo (20290402160000): una commessa che ha già una ritenuta non si tocca.
-- La funzione di conversione si modifica sul suo testo attuale: se il punto atteso non c'è, la migrazione
-- si ferma invece di indovinare.

set local lock_timeout = '3s';

create or replace function public.ritenuta_da_piano_preventivo(p_piano jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $f$
  select case
    when jsonb_typeof(p_piano) = 'object' and jsonb_typeof(p_piano->'ritenuta') = 'object'
         and coalesce(nullif(replace(p_piano->'ritenuta'->>'percentuale', ',', '.'), ''), '0') ~ '^[0-9]+(\.[0-9]+)?$'
         and replace(p_piano->'ritenuta'->>'percentuale', ',', '.')::numeric > 0
         and replace(p_piano->'ritenuta'->>'percentuale', ',', '.')::numeric <= 100
    then jsonb_build_object(
      'percentuale', round(replace(p_piano->'ritenuta'->>'percentuale', ',', '.')::numeric, 2),
      'su', 'sal',
      'svincolo', case when p_piano->'ritenuta'->>'svincolo' = 'mesi' then 'mesi' else 'collaudo' end,
      'mesi', case when coalesce(p_piano->'ritenuta'->>'mesi', '') ~ '^[0-9]{1,2}$'
                   then least(greatest((p_piano->'ritenuta'->>'mesi')::int, 1), 60) else 12 end)
  end
$f$;

revoke all on function public.ritenuta_da_piano_preventivo(jsonb) from public, anon;
grant execute on function public.ritenuta_da_piano_preventivo(jsonb) to authenticated, service_role;

do $converti$
declare def text; nuova text; segno constant text := 'ordine:=(esito->>''id'')::uuid;';
begin
 def := pg_get_functiondef('public.converti_modulo_commessa_atomic'::regproc);
 if def ~ 'ritenuta_da_piano_preventivo' then return; end if;
 if (select count(*) from regexp_matches(def, 'ordine:=\(esito->>''id''\)::uuid;', 'g')) <> 1 then
  raise exception 'converti_modulo_commessa_atomic: punto di creazione della commessa non trovato, controllare a mano';
 end if;
 nuova := replace(def, segno, segno || '
  -- La ritenuta di garanzia del piano del preventivo (15/11/2026, 20290402180000).
  update public.orders o
     set ritenuta_garanzia = public.ritenuta_da_piano_preventivo(coalesce(q->''piano_pagamento'', q->''modalita_pagamento''))
   where o.id = ordine and o.ritenuta_garanzia is null
     and public.ritenuta_da_piano_preventivo(coalesce(q->''piano_pagamento'', q->''modalita_pagamento'')) is not null;');
 execute nuova;
end $converti$;
