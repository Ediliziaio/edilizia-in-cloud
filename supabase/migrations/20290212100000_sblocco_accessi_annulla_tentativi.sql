-- Lo sblocco dell'amministratore deve funzionare anche senza il nuovo deploy.
--
-- `20290131120000_sblocco_accessi_amministratore` ha messo il conteggio del
-- blocco in un posto solo (`stato_blocco_accesso`) e ha dato all'amministratore
-- un vero sblocco: una riga in `login_lock_resets` che fa ripartire il conteggio
-- da quel momento.
--
-- Il punto debole è che quel punto di ripartenza lo guarda SOLO il conteggio
-- nuovo. La versione di `check-login-security` in produzione (la 157) conta
-- ancora per conto suo, in TypeScript, le righe `login_attempts` con
-- `failure_reason = 'invalid_credentials'` per la coppia (email, IP): non sa
-- nulla di `login_lock_resets`. Finché quella funzione non viene ripubblicata —
-- e in questo progetto il deploy delle edge function salta a ogni CI rossa,
-- anche per colpa di un file che non c'entra — l'amministratore premerebbe
-- «Sblocca», l'elenco dei bloccati gli direbbe che è andato bene, e la persona
-- continuerebbe a non entrare. Un bottone che mente è peggio del bottone che
-- non c'era: è esattamente il difetto da cui è nata questa storia, con
-- l'impostazione che prometteva uno sblocco inesistente.
--
-- Quindi lo sblocco smette di essere una riga che qualcuno deve ricordarsi di
-- leggere, e diventa un fatto scritto dove il conteggio guarda: i tentativi che
-- stava contando vengono marcati come annullati.
--
-- Non si cancella e non si inventa nulla. La riga resta con la sua email, il suo
-- indirizzo e la sua ora, e dice due cose invece di una: che la password era
-- sbagliata, e che un amministratore ha annullato quel conteggio. Così il blocco
-- si scioglie per chiunque conti — la funzione online di adesso, quella nuova
-- dopo il deploy, e qualunque cosa venga dopo.
--
-- `failure_reason` è testo libero, senza vincoli né enum, e l'unico punto in
-- tutto il codice che ne confronta il valore su `login_attempts` è il conteggio
-- di `check-login-security`. Il pannello admin mostra la colonna così com'è.

create or replace function public.sblocca_accesso(p_email text, p_ip text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_mia_azienda uuid;
  v_utente      uuid;
  v_sua_azienda uuid;
  v_ip          inet;
  v_annullati   integer;
begin
  if p_email is null or p_ip is null then
    raise exception 'Serve l email e l indirizzo da sbloccare.';
  end if;

  begin
    v_ip := p_ip::inet;
  exception when others then
    raise exception 'Indirizzo non valido.';
  end;

  select pr.company_id into v_mia_azienda
    from public.profiles pr
   where pr.id = auth.uid();

  if v_mia_azienda is null then
    raise exception 'Non riesco a capire di quale azienda fai parte.';
  end if;

  if not (public.has_role(auth.uid(), 'company_admin'::app_role)
          or public.is_super_admin(auth.uid())) then
    raise exception 'Solo un amministratore puo sbloccare un accesso.';
  end if;

  select pr.id, pr.company_id into v_utente, v_sua_azienda
    from public.profiles pr
   where pr.email = p_email
   limit 1;

  -- Il confine fra aziende: un amministratore sblocca solo la propria gente.
  if v_sua_azienda is null or v_sua_azienda <> v_mia_azienda then
    raise exception 'Questo accesso non e di un utente della tua azienda.';
  end if;

  insert into public.login_lock_resets (company_id, email, ip_address, reset_by)
  values (v_mia_azienda, p_email, v_ip, auth.uid());

  -- I tentativi che il blocco stava contando, e solo quelli: questa email da
  -- questo indirizzo. Nessuna altra persona e nessun altro computer.
  update public.login_attempts
     set failure_reason = 'invalid_credentials_sbloccato'
   where email = p_email
     and ip_address = v_ip
     and success = false
     and failure_reason = 'invalid_credentials';
  get diagnostics v_annullati = row_count;

  insert into public.user_audit_log (actor_id, company_id, action, target_user_id, details, ip_address)
  values (auth.uid(), v_mia_azienda, 'account_unlocked', v_utente,
          jsonb_build_object('email', p_email, 'ip_address', host(v_ip),
                             'tentativi_annullati', v_annullati), v_ip);

  return true;
end;
$$;

comment on function public.sblocca_accesso(text, text) is
  'Riapre l accesso per una coppia (email, IP): segna il punto di ripartenza in login_lock_resets e marca come annullati i tentativi che il blocco stava contando, cosi vale anche per chi conta senza leggere i punti di ripartenza. Solo company_admin e super_admin, e solo sulla propria azienda.';

revoke all on function public.sblocca_accesso(text, text) from public, anon;
grant execute on function public.sblocca_accesso(text, text) to authenticated, service_role;
