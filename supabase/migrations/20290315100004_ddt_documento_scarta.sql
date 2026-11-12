-- Una bolla caricata e non ancora registrata si può scartare (12/11/2026).
--
-- Una bolla doppia, letta e rimasta «Da controllare in ufficio», non si toglieva più: il cestino
-- della finestra «Carica più bolle» la levava solo dalla finestra, e il documento caricato
-- restava nell'elenco. Sulla tabella il browser può solo leggere: serve una funzione.
-- Si scarta ciò che non è diventato un DDT (in lettura, da controllare, in errore, solo foto);
-- un DDT già registrato si elimina dall'elenco dei DDT. La scarta chi l'ha caricata, l'ufficio
-- o l'amministratore: le stesse persone che la vedono.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ddt_documento_scarta(p_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_job record;
begin
  select id, company_id, created_by, status, files into v_job from public.ddt_document_jobs where id = p_id for update;
  if v_job.id is null then raise exception 'Documento non trovato: forse è già stato scartato'; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.user_can_access_company(v_job.company_id)
     or not (v_job.created_by = auth.uid() or public.campo_e_ufficio(v_job.company_id) or public.e_super_admin_dentro(v_job.company_id)) then
    raise exception 'Non hai i permessi per scartare questa bolla' using errcode = '42501';
  end if;
  if v_job.status in ('registered', 'split') then
    raise exception 'Questa bolla è già un DDT registrato: si elimina dall''elenco dei DDT' using errcode = '22023';
  end if;
  delete from public.ddt_document_jobs where id = p_id;
  -- I file li toglie l'app dall'archivio, se può: qui restano solo i percorsi.
  return jsonb_build_object('scartato', true, 'files', v_job.files);
end $function$;

revoke all on function public.ddt_documento_scarta(uuid) from public, anon;
grant execute on function public.ddt_documento_scarta(uuid) to authenticated;
