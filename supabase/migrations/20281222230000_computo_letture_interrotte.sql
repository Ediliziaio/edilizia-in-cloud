-- Computo: una lettura interrotta non resta «in corso» per sempre.
--
-- Controllo del 07/11/2026 sui computi caricati negli ultimi 120 giorni: un PDF
-- da 9,7 MB (Demo Azienda 2, 22/10) era fermo su «extracting_text» da 16 giorni.
-- La edge function computo-ai-extract è stata chiusa a metà (una funzione non
-- vive più di qualche minuto) e nessuno ha scritto l'esito: la pagina mostra la
-- lettura in corso all'infinito e non propone di riprovare.
--
-- computo_chiudi_letture_interrotte(): ogni computo in uno stato di lavoro
-- (uploading, extracting_text, analyzing_ai, validating, generating) fermo da
-- più di 30 minuti diventa «failed», con un messaggio che dice cosa fare. Una
-- lettura vera non dura così tanto. Gira in pg_cron ogni 15 minuti: SQL puro,
-- niente pg_net.

set local lock_timeout = '3s';

create or replace function public.computo_chiudi_letture_interrotte()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n integer;
begin
  update public.computo_uploads
     set extraction_status = 'failed',
         extraction_error = 'La lettura si è interrotta prima di finire (file molto grande o troppe pagine da leggere con l''AI). '
                            || 'Riprova; se si ferma di nuovo, carica il computo diviso in parti o, se c''è, il file PriMus (XPWE) o l''Excel.',
         updated_at = now()
   where extraction_status in ('uploading', 'extracting_text', 'analyzing_ai', 'validating', 'generating')
     and updated_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.computo_chiudi_letture_interrotte() from public, anon, authenticated;
grant execute on function public.computo_chiudi_letture_interrotte() to service_role;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'computo-letture-interrotte') then
    perform cron.unschedule('computo-letture-interrotte');
  end if;
  perform cron.schedule('computo-letture-interrotte', '*/15 * * * *', 'select public.computo_chiudi_letture_interrotte();');
end
$cron$;
