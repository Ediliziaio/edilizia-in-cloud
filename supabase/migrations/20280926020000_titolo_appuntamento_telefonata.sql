-- Titolo automatico degli appuntamenti: la telefonata non è in showroom (25/09/2026).
--
-- titolo_appuntamento aggiunge lo showroom del consulente a ogni appuntamento
-- che non è fuori sede («Andriciuc Florin | Il Bagno Group Show-room Lissone -
-- Via Nuova Valassina 27»). Alla prima chiamata fissata dall'agente WhatsApp
-- il titolo diceva showroom per una telefonata conoscitiva. Ora per i tipi
-- «telefonata» e «chiamata» il titolo finisce con «Telefonata»; tutto il resto
-- resta com'era.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.titolo_appuntamento(p_company uuid, p_etichetta text, p_contatto uuid, p_consulente uuid, p_tipo text, p_indirizzo text, p_citta text)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  with contatto as (
    select btrim(concat_ws(' ',
             nullif(btrim(c.last_name), ''),
             nullif(btrim(c.first_name), ''))) as nome
    from marketing_contacts c
    where c.id = p_contatto
  ),
  sede as (
    -- La forma che usano già su Google Calendar:
    -- «Show-room Lissone - Via Nuova Valassina 27».
    select btrim(concat_ws(' - ',
             'Show-room ' || btrim(s.nome),
             nullif(btrim(s.indirizzo), ''))) as dove
    from company_sedi_utenti u
    join company_sedi s on s.id = u.sede_id
    where u.company_id = p_company
      and u.user_id = p_consulente
      and s.attiva
      and not public.appuntamento_fuori_sede(p_tipo)
      and coalesce(p_tipo, '') not in ('telefonata', 'chiamata')
  )
  select case
    when coalesce((select nome from contatto), '') = '' then null
    else btrim(concat_ws(' ',
      (select nome from contatto) || ' | ' || nullif(btrim(coalesce(p_etichetta, '')), ''),
      case
        when coalesce(p_tipo, '') in ('telefonata', 'chiamata') then 'Telefonata'
        else coalesce(
          nullif((select dove from sede), ''),
          nullif(btrim(concat_ws(', ', nullif(btrim(coalesce(p_indirizzo, '')), ''), nullif(btrim(coalesce(p_citta, '')), ''))), '')
        )
      end))
  end
$function$;
