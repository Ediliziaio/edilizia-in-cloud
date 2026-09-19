-- Segreti di platform_settings: gli indicatori non sono segreti (19/09/2026).
--
-- La regola di 20280919350000 prendeva per segreta ogni chiave con _key,
-- _secret, _token, _pass o _password, anche seguiti da un suffisso. Così anche
-- openrouter_api_key_set, che la pagina AI Router scrive «true»/«false» per dire
-- se la chiave c'è: nel secondo tempo il suo valore sarebbe sparito dalla
-- tabella e la pagina avrebbe letto «non impostata». Restano fuori le chiavi
-- che finiscono con _set, _configured, _configurata, _missing, _status, _at, _id.

create or replace function public.e_segreto_piattaforma(p_chiave text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p_chiave, '') ~ '(_key|_secret|_token|_pass|_password)(_|$)'
     and coalesce(p_chiave, '') !~ '_(set|configured|configurata|missing|status|at|id)$'
     and p_chiave not in ('posthog_api_key', 'stripe_publishable_key');
$$;

revoke all on function public.e_segreto_piattaforma(text) from public, anon;
grant execute on function public.e_segreto_piattaforma(text) to authenticated, service_role;
