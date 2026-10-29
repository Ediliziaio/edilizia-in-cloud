-- La mappa del CRM non si chiama senza aver fatto l'accesso.
--
-- `crm_map_points_bbox` restituisce i punti della mappa CRM: nome, email,
-- telefono, indirizzo, fatturato e conteggio attivita' di aziende e contatti
-- marketing. Risultava eseguibile dal ruolo `anon`, cioe' da chiunque conosca
-- l'URL del progetto, e compariva come «NON CLASSIFICATA» in
-- `v_funzioni_aperte_ad_anon`.
--
-- Non era sfruttabile: la prima riga del corpo e' `if not is_super_admin()
-- then raise exception ... 42501`, e da `anon` risponde «not authorized»
-- (provato). Ma la riga non classificata resta nel registro dei controlli, che
-- serve esattamente a far trovare le funzioni nuove rimaste aperte per
-- sbaglio: finche' c'e' questa, il segnale non e' pulito e la prossima
-- dimenticanza si nasconde in mezzo.
--
-- Il privilegio arrivava da DUE sorgenti, e vanno togliete entrambe:
--   `{=X/postgres, ... anon=X/postgres}`
--   - `=X` e' PUBLIC: Postgres concede EXECUTE a PUBLIC su OGNI funzione
--     appena creata, quindi `anon` lo eredita anche senza un GRANT suo;
--   - `anon=X` e' un GRANT esplicito, aggiunto in passato.
-- Revocare solo da `anon` lascerebbe PUBLIC, e la funzione resterebbe aperta.
--
-- `authenticated` lo conserva perche' la chiama il browser
-- (`useCrmMapViewport` → `useCrmMapPointsBbox`) e il controllo super admin sta
-- dentro la funzione; `service_role` lo conserva per i lavori di servizio.
--
-- Idempotente: REVOKE e GRANT si possono rieseguire.

revoke all on function public.crm_map_points_bbox(uuid, double precision, double precision, double precision, double precision, integer)
  from public, anon;

grant execute on function public.crm_map_points_bbox(uuid, double precision, double precision, double precision, double precision, integer)
  to authenticated, service_role;

comment on function public.crm_map_points_bbox(uuid, double precision, double precision, double precision, double precision, integer) is
  'Punti della mappa CRM dentro un rettangolo. Solo super admin: il controllo e'' nel corpo (is_super_admin). Chiusa a PUBLIC e anon il 29/10/2026.';
