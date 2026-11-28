-- Il confronto dei nomi non dipende più da `unaccent`
-- ──────────────────────────────────────────────────
-- 28/11/2026, dal controllo «Complete offline database reconstruction», che rigioca tutte le
-- migrazioni su un database vuoto: `private.nome_confrontabile` usava `public.unaccent`, che in
-- produzione c'è ma che **nessuna migrazione del repository installa**. Il corpo di una funzione
-- `language sql` viene analizzato alla creazione, quindi lì la migrazione si fermava.
--
-- Gli accenti si tolgono con `translate`: niente estensioni, e la funzione torna `immutable`.
-- Il file 20290630310000 è stato corretto nello stesso modo, così la ricostruzione da zero passa.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function private.nome_confrontabile(p_testo text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select nullif(btrim(regexp_replace(
           translate(lower(coalesce(p_testo, '')),
                     'àáâãäåèéêëìíîïòóôõöùúûüçñ',
                     'aaaaaaeeeeiiiiooooouuuucn'),
           '\s+', ' ', 'g')), '');
$function$;

revoke all on function private.nome_confrontabile(text) from public, anon, authenticated;
