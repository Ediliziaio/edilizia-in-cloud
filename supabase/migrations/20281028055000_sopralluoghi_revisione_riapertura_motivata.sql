set local lock_timeout='3s';
set local statement_timeout='60s';
-- Close the generic status-change path as well as the dedicated review RPC.
-- Preserve the already tested trigger body, replacing only its reopening predicate.
do $migration$ declare source text; old_rule text:='(old.status=''completed'' and new.status=''in_progress'')'; new_rule text:='(old.status in (''completed'',''reviewed'') and new.status in (''draft'',''in_progress''))'; begin
 select pg_get_functiondef('survey_private.guard_header()'::regprocedure) into source;
 if position(old_rule in source)>0 then execute replace(source,old_rule,new_rule);
 elsif position(new_rule in source)=0 then raise exception 'Unexpected survey review guard: inspect concurrent changes before applying'; end if;
end $migration$;
