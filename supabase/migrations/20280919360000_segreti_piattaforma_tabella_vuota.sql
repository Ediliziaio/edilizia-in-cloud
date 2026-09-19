-- I segreti di platform_settings nel Vault — secondo tempo (19/09/2026).
--
-- Il primo tempo (20280919350000) ha copiato i segreti nel Vault e fatto
-- passare le letture da impostazione_piattaforma(). Le edge function che le
-- usano sono pubblicate e provate: ora la tabella si svuota.
--
-- 1. Il trigger SPOSTA: un segreto scritto nella tabella va nel Vault, e nella
--    tabella resta la riga con il valore vuoto. La colonna non accetta NULL, e
--    le pagine admin guardano se la riga c'è per mostrare «impostata».
-- 2. I valori in chiaro si svuotano, solo dove il Vault ha lo stesso valore.
-- 3. Le righe segrete vuote e senza niente nel Vault (render_anthropic_api_key,
--    render_gemini_api_key) si tolgono: la pagina AI le mostrava «impostate».
-- 4. Se resta un segreto in chiaro la migrazione si ferma.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Il trigger sposta ------------------------------------------------------------
create or replace function public.platform_settings_segreto_nel_vault()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.e_segreto_piattaforma(new.key) and coalesce(btrim(new.value), '') <> '' then
    perform public.salva_segreto_piattaforma(new.key, new.value);
    new.value := '';
  end if;
  return new;
end;
$$;

revoke all on function public.platform_settings_segreto_nel_vault() from public, anon, authenticated;

-- 2. Via i valori in chiaro ------------------------------------------------------------
update public.platform_settings p
   set value = ''
 where public.e_segreto_piattaforma(p.key)
   and btrim(p.value) <> ''
   and exists (
     select 1
       from vault.decrypted_secrets s
      where s.name = 'platform_settings.' || p.key
        and s.decrypted_secret = p.value
   );

-- 3. Via le righe segrete vuote --------------------------------------------------------
delete from public.platform_settings p
 where public.e_segreto_piattaforma(p.key)
   and btrim(p.value) = ''
   and not exists (select 1 from vault.secrets s where s.name = 'platform_settings.' || p.key);

-- 4. Nessun segreto in chiaro ----------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.platform_settings p
     where public.e_segreto_piattaforma(p.key) and btrim(p.value) <> ''
  ) then
    raise exception 'Restano segreti in chiaro in platform_settings';
  end if;
end $$;
