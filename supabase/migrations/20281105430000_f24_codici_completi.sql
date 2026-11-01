-- F24: i codici tributo che un'impresa edile versa davvero (lotto 5 di docs/piano-costi-commessa.md, E2,
-- 01/11/2026).
--
-- Prima: il guardiano fiscale (private.fiscalita_guard) e la conferma del mese (fiscalita_f24_conferma)
-- accettavano solo 1001, 1040 e l'IVA mensile 6001-6012. Chi liquida l'IVA a trimestre, versa l'acconto di
-- dicembre, IRES, IRAP, le addizionali o i contributi non poteva registrarli: quegli F24 non esistevano per
-- il gestionale, né in Contabilità fiscale né nel previsionale.
--
-- Ora l'elenco sta in una funzione sola, f24_codice_ammesso(codice), usata da entrambi:
--   · ritenute: 1001 dipendenti, 1040 autonomi, 1012 indennità di fine rapporto, 1712/1713 imposta sul TFR;
--   · addizionali IRPEF trattenute: 3802 regionale, 3847 comunale acconto, 3848 comunale saldo;
--   · IVA: 6001-6012 mensile, 6031-6034 trimestrale, 6035 acconto, 6099 annuale;
--   · IRES 2001/2002/2003 (acconti e saldo), IRAP 3812/3813/3800;
--   · DM10: i contributi INPS della sezione INPS (un'unica riga per il mese).
-- La coerenza codice/mese dell'IVA mensile resta quella di prima.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.f24_codice_ammesso(p_codice text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_codice in (
    '1001', '1040', '1012', '1712', '1713',
    '3802', '3847', '3848',
    '6001', '6002', '6003', '6004', '6005', '6006', '6007', '6008', '6009', '6010', '6011', '6012',
    '6031', '6032', '6033', '6034', '6035', '6099',
    '2001', '2002', '2003',
    '3812', '3813', '3800',
    'DM10'
  );
$$;
revoke all on function public.f24_codice_ammesso(text) from public, anon;
grant execute on function public.f24_codice_ammesso(text) to authenticated, service_role;

-- Le due funzioni usano la funzione al posto dell'elenco scritto dentro. Si sostituisce solo quella
-- condizione, e si pretende di trovarla: se il testo fosse cambiato, meglio fermarsi che indovinare.
do $$
declare
  v_def text;
  v_nuova text;
begin
  v_def := pg_get_functiondef('private.fiscalita_guard()'::regprocedure);
  v_nuova := replace(v_def,
    '(new.tributo_code not in(''1001'',''1040'') and new.tributo_code not in(select (6000+x)::text from generate_series(1,12) x))',
    'not public.f24_codice_ammesso(new.tributo_code)');
  if v_nuova = v_def and position('f24_codice_ammesso' in v_def) = 0 then
    raise exception 'private.fiscalita_guard: condizione dei codici F24 non trovata';
  end if;
  execute v_nuova;

  v_def := pg_get_functiondef('public.fiscalita_f24_conferma(uuid, integer, integer, text, jsonb, text)'::regprocedure);
  v_nuova := replace(v_def,
    '(v_code not in(''1001'',''1040'') and v_code not in(select (6000+x)::text from generate_series(1,12) x))',
    'not public.f24_codice_ammesso(v_code)');
  if v_nuova = v_def and position('f24_codice_ammesso' in v_def) = 0 then
    raise exception 'fiscalita_f24_conferma: condizione dei codici F24 non trovata';
  end if;
  execute v_nuova;
end $$;
