-- Completamento PR 186: l'annullamento definitivo non è un auto-rifiuto.
-- La regola sull'autoapprovazione resta invariata. Nessun dato cliente modificato.
set local lock_timeout='3s';
set local statement_timeout='60s';
do $migration$
declare
  v_def text;
  v_old text := $old$or (new.user_id = v_uid and not coalesce(public.e_amministratore_di(new.company_id), false))) then$old$;
  v_new text := $new$or (new.user_id = v_uid and not coalesce(public.e_amministratore_di(new.company_id), false)
              and not coalesce(
                tg_op = 'UPDATE' and old.stato = 'inviato' and new.stato = 'rifiutato'
                and not coalesce(new.approvato, false)
                and old.annullato_at is null and new.annullato_at is not null
                and new.annullato_da = v_uid
                and nullif(btrim(coalesce(new.motivo_rifiuto, '')), '') is not null
                and public.has_permission_for_company(v_uid, 'can_view_orders', new.company_id) is true
                and public.puo_vedere_commessa(new.order_id) is true
                and not exists (
                  select 1 from public.appalto_rendiconto_righe a
                   where a.stato <> 'bozza' and (a.rapportino_id = new.id or a.voce_libera_id in (
                     select v.id from public.rapportino_voci_libere v where v.rapportino_id = new.id)))
                and not exists (
                  select 1 from public.giornale_lavori g where g.order_id = new.order_id
                    and g.stato = 'firmata' and new.id = any(g.source_rapportini_ids)),
                false))) then$new$;
begin
  v_def := pg_get_functiondef('public.campo_rapportino_verifica_flusso()'::regprocedure);
  if position(v_new in v_def) > 0 then return; end if;
  if position(v_old in v_def) = 0 then
    raise exception 'Il controllo dei rapportini è cambiato: verificare la regola prima di applicare la correzione.';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
