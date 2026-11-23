-- Vetrina Demo Azienda 2: il copione notturno numerava le fatture «FT/AAAA/NNN» con
-- max(progressive_number)+1 su TUTTE le fatture dell'anno (una serie di prova è a 30.144) e poi
-- lpad(…, 3, '0'), che in Postgres TRONCA: 30144 → «301». Dal 11/10/2026 ogni fattura nuova
-- usciva «FT/2026/301» (9 doppioni, rinumerati a mano il 23/11/2026 in FT/2026/092–100).
--
-- Qui: il progressivo si calcola solo sulle fatture della serie «FT/<anno>/<numero>», e il numero
-- non si tronca mai (almeno 3 cifre, di più se servono). Si correggono le due righe dentro la
-- definizione attuale invece di riscriverla intera: idempotente (se la correzione c'è già, la
-- sostituzione non trova niente) e fallisce rumorosamente se il testo atteso non c'è più.
-- Tocca solo la vetrina: la funzione rifiuta ogni company_id che non sia Demo 2.
do $mig$
declare
  d text;
  nuovo text;
begin
  select pg_get_functiondef('public.demo_scenario_applica(uuid, date)'::regprocedure) into d;

  if position('invoice_number ~ (''^FT/''||v_anno||''/\d+$'')' in d) > 0 then
    raise notice 'demo_scenario_applica: numerazione FT già corretta';
    return;
  end if;

  nuovo := regexp_replace(d,
    'select coalesce\(max\(progressive_number\),0\)\+1 into v_prog from invoices\s+where company_id=p_company_id and invoice_year=v_anno;',
    -- Nella sostituzione di regexp_replace «\\» vale una barra: «\\d» diventa «\d».
    $r$select coalesce(max(substring(invoice_number from '^FT/'||v_anno||'/(\\d+)$')::int),0)+1 into v_prog from invoices
           where company_id=p_company_id and invoice_year=v_anno and invoice_number ~ ('^FT/'||v_anno||'/\\d+$');$r$);
  nuovo := replace(nuovo,
    $r$'FT/'||v_anno||'/'||lpad(v_prog::text,3,'0')$r$,
    $r$'FT/'||v_anno||'/'||lpad(v_prog::text,greatest(3,length(v_prog::text)),'0')$r$);

  if nuovo = d
     or position('greatest(3,length(v_prog::text))' in nuovo) = 0
     or position('invoice_number ~ (''^FT/''||v_anno||''/\d+$'')' in nuovo) = 0 then
    raise exception 'demo_scenario_applica: testo atteso non trovato, correzione non applicata';
  end if;

  execute nuovo;
end
$mig$;
