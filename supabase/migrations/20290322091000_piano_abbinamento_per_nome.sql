-- 20290322091000_piano_abbinamento_per_nome.sql
--
-- I costi finivano sulla voce sbagliata del piano economico (14/11/2026, URBAN VISION):
-- un costo «Opere civili» o «Finiture» non era riconosciuto da generale_piano_chiave_costo
-- (nessuna parola delle lavorazioni edili), diventava «altro» e finiva sulla prima voce delle
-- spese generali per ordine: «Costi amministrativi e di gestione SPV». A parità di categoria,
-- poi, vinceva sempre la prima voce per ordine, anche se un'altra aveva lo stesso nome.
--
-- 1. generale_piano_chiave_costo riconosce le lavorazioni (opere, scavi, strutture, finiture,
--    demolizioni, coperture…) come «costruzione», che abbina alle voci della costruzione.
-- 2. generale_piano_somiglianza: quante parole (le prime 5 lettere, almeno 4 lettere, senza
--    parole vuote) la voce ha in comune con il costo. Nell'abbinamento, a parità di aggancio
--    esplicito, vince la voce che somiglia: «Opere civili» va su «Opere civili secondo computo».
--    L'aggancio esplicito (categorie_costo della voce) resta sopra a tutto.

create or replace function public.generale_piano_chiave_costo(p_categoria text)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'public'
as $function$
  select case
    when c = '' then 'altro'
    when c ~ '(^|_)iva(_|$)' then 'iva'
    when c ~ 'consulenza_lavoro|commercialist|paghe|affitt|pernottament' then 'generali'
    when c ~ 'terren|notai|rogit|compravendit|immobil' then 'terreno'
    when c ~ 'oneri|permess|concession|urbanizzaz|diritti|(^|_)imu(_|$)|tass|tribut|catast|imposte' then 'oneri'
    when c ~ 'progett|direzione_lavori|profession|tecnic|geometr|ingegner|architett|consulen|collaud|perizi' then 'progettazione'
    when c ~ 'subappalt|squadr|cottim|manodopera_estern|decorator|idraulic|elettricist|murator|cartongess|imbianchin|posator' then 'subappalti'
    when c ~ 'stipend|salari|personale|(^|_)inps|(^|_)inail|(^|_)tfr(_|$)|manodopera|dipendent|contribut' then 'manodopera'
    -- Le lavorazioni edili: prima dei materiali, perché «opere edili» è una lavorazione.
    when c ~ '(^|_)oper[ae](_|$)|civil|scav|strutture|struttural|fondazion|demoli|copertur|tetto|intonac|pavimen|rivestim|finitur|cappott|massett|carpenter|cemento_armat|impermeab|lattoner|fabbr|tinteggi|ristruttur|costruz|computo|palificaz|(^|_)pali(_|$)|solai|vespai|sbancament|sistemazion' then 'costruzione'
    when c ~ 'material|merci|acquist|fornitur|calcestruzz|acciai|ferrament|edil|cement|laterizi|legname|profili|finestre|serrament|isolament|tapparell|zanzarier|impiant' then 'materiali'
    when c ~ 'trasport|nolegg|(^|_)nol[io](_|$)|mezz|veicol|carburant|leasing|attrezzatur|ponteggi|logistic' then 'noli'
    when c ~ 'sicurezz|(^|_)dpi(_|$)' then 'sicurezza'
    when c ~ 'allacc|utenz|(^|_)enel(_|$)|acqua|(^|_)gas(_|$)|energia|telefon' then 'allacci'
    when c ~ 'provvigion|marketing|pubblicit|(^|_)adv(_|$)|agenzi|commercializz|vendit' then 'commercializzazione'
    when c ~ 'interess|mutu[oi]|banc|fideiussion|finanz|canone_c_c|bollo|commission' then 'finanziari'
    when c ~ 'imprevist|errori|danni|sinistr' then 'imprevisti'
    when c ~ 'assicuraz|cancelleri|software|struttura|servizi|generali|manutenz|rifiut|formazion|trasfert|viaggi|pasto|sosta' then 'generali'
    else 'altro'
  end
  from (select public.generale_piano_norm(p_categoria) as c) x;
$function$;

create or replace function public.generale_piano_somiglianza(p_voce text, p_reale text)
 returns integer
 language sql
 immutable parallel safe
 set search_path to 'public'
as $function$
  -- Parole in comune tra la descrizione di una voce e il costo (categoria e descrizione):
  -- le prime 5 lettere, così «civile» e «civili», «relazione» e «relazioni» sono la stessa parola.
  with vuote(p) as (values ('della'), ('delle'), ('degli'), ('dalla'), ('dalle'), ('nella'), ('nelle'),
                           ('sulla'), ('sulle'), ('costi'), ('costo'), ('spese'), ('spesa'), ('fattu'),
                           ('total'), ('compr'), ('secon'), ('altri'), ('altre'))
  select count(*)::integer
    from (select distinct left(t, 5) as t
            from regexp_split_to_table(public.generale_piano_norm(p_voce), '_') t
           where length(t) >= 4 and t !~ '^[0-9]+$') a
   where a.t not in (select p from vuote)
     and a.t in (select left(u, 5)
                   from regexp_split_to_table(public.generale_piano_norm(p_reale), '_') u
                  where length(u) >= 4);
$function$;

revoke all on function public.generale_piano_somiglianza(text, text) from public, anon;
grant execute on function public.generale_piano_somiglianza(text, text) to authenticated, service_role;

create or replace function public.generale_piano_righe_abbinate(p_generale_id uuid, p_versione_id uuid, p_costi boolean, p_ricavi boolean)
 returns table(id text, fonte text, rif_id uuid, order_id uuid, data date, tipo text, chiave text, categoria text, descrizione text, importo numeric, voce_id uuid)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select r.id, r.fonte, r.rif_id, r.order_id, r.data, r.tipo, r.chiave, r.categoria, r.descrizione, r.importo,
         (select v.id
            from public.generale_piano_voci v
           cross join lateral (
             select public.generale_piano_rango(v.categoria, v.categorie_costo, r.chiave, public.generale_piano_norm(r.categoria)) as rango,
                    public.generale_piano_somiglianza(v.descrizione, concat_ws(' ', r.categoria, r.descrizione)) as simile
           ) k
           where v.versione_id = p_versione_id
             and v.tipo = r.tipo
             and k.rango is not null
             and (v.figlia_id is null or v.figlia_id = r.order_id)
           -- L'aggancio esplicito prima di tutto; poi, tra le voci della categoria giusta, quella
           -- col nome più simile; poi la prima per ordine.
           order by (k.rango = 3), (k.rango > 0), (v.figlia_id is null), (k.simile = 0), k.rango, k.simile desc,
                    v.ordine, v.created_at, v.id
           limit 1)
    from public.generale_piano_righe_reali(p_generale_id, p_costi, p_ricavi) r;
$function$;
