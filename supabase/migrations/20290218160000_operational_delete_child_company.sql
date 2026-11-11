-- Un figlio incoerente di un'altra azienda non deve essere cancellato in cascata.
-- Aggiornamento additivo della funzione, senza modificare documenti o permessi.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $guard$
declare
  v_definition text;
  v_marker text := 'for v_child in select value from jsonb_array_elements(v_children) loop';
begin
  v_definition := pg_get_functiondef('public.operational_documents_delete(uuid,text,uuid[],boolean,jsonb)'::regprocedure);
  if position('Collegamenti aziendali incoerenti' in v_definition)>0 then return; end if;
  if position(v_marker in v_definition)=0 then
    raise exception 'Funzione di eliminazione modificata: verificare prima di aggiungere il controllo aziendale';
  end if;
  execute replace(v_definition, v_marker, v_marker || $patch$
         if (v_child ? 'company_id') and (v_child->>'company_id') is distinct from p_company_id::text then
           v_reason := 'Collegamenti aziendali incoerenti: il documento richiede una verifica prima dell’eliminazione';
           exit;
         end if;
$patch$);
end $guard$;
