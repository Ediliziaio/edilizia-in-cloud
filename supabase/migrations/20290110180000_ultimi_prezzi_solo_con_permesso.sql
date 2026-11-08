-- `materiali_ultimi_prezzi` restituisce prezzi di acquisto: solo a chi può vederli (08/11/2026).
-- Le funzioni non passano dal blocco sulle letture dirette, quindi il controllo sta qui.
--
-- Nessuna riga viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $migrazione$
declare
  vecchio text := $o$where po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and coalesce(poi.unit_price, 0) > 0$o$;
  nuovo text := $n$where po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and ((select public.utente_super_admin()) or p_company = any ((select public.aziende_area(array['can_view_costs','can_manage_purchasing']))::uuid[]))
     and coalesce(poi.unit_price, 0) > 0$n$;
  def text := pg_get_functiondef('public.materiali_ultimi_prezzi(uuid,text[])'::regprocedure);
begin
  if position('can_manage_purchasing' in def) > 0 then
    return;
  end if;
  if position(vecchio in def) = 0 then
    raise exception 'Pezzo non trovato in materiali_ultimi_prezzi';
  end if;
  execute replace(def, vecchio, nuovo);
end
$migrazione$;
