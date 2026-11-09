-- Le conversazioni dell'azienda le legge chi ci lavora (09/11/2026).
--
-- conversazioni_puo_accedere controllava solo che l'utente appartenesse
-- all'azienda. Ma ci appartengono anche i subappaltatori, gli operai e i clienti
-- del portale: provato con un subappaltatore vero, conversazioni_lista gli
-- restituiva le conversazioni con le anteprime dei messaggi. Da qui passano
-- conversazione_timeline, conversazioni_lista, conversazioni_cerca,
-- conversazioni_non_lette, conversazione_dettagli_invio e le regole sui
-- messaggi social.
--
-- Ora serve almeno un ruolo interno. Chi ha solo ruoli esterni resta fuori,
-- anche se ha un accesso multi-azienda: nessuno dei 18 account di questo tipo
-- aveva il permesso sui clienti o su WhatsApp, quindi nessuno perde una pagina.
-- Un utente senza alcun ruolo resta fuori anche lui.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.conversazioni_puo_accedere(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    public.is_super_admin(auth.uid())
    or (
      (
        p_company_id = public.get_user_company_id(auth.uid())
        or exists (
          select 1 from public.multi_company_access mca
           where mca.user_id = auth.uid() and mca.company_id = p_company_id
             and mca.status = 'active'
             and (mca.expires_at is null or mca.expires_at > now())
        )
      )
      and exists (
        select 1 from public.user_roles ur
         where ur.user_id = auth.uid()
           and ur.role::text <> all (array['customer', 'subcontractor', 'employee', 'worker', 'referrer', 'accountant'])
      )
    ),
    false
  );
$function$;

revoke all on function public.conversazioni_puo_accedere(uuid) from public, anon;
grant execute on function public.conversazioni_puo_accedere(uuid) to authenticated, service_role;
