-- «Blocca accesso» non toglieva l'accesso ai dati.
--
-- La pagina Utenti ha da sempre «Blocca accesso», che mette `is_blocked` sul
-- profilo. Ma quel flag era guardato in UN SOLO posto: `LoginForm.tsx`, cioe'
-- la schermata di login del browser, DOPO che l'autenticazione e' gia'
-- riuscita. Verificato: zero policy RLS e zero funzioni di accesso lo
-- leggevano. Il commento nel codice diceva «RLS protegge l'accesso ai dati»,
-- e non era vero.
--
-- Conseguenze concrete, tutte e tre reali:
--  · chi era GIA' dentro restava dentro — il controllo scatta solo al login, e
--    le sessioni Supabase si rinnovano da sole;
--  · il controllo si salta senza volerlo — il codice procede col login se la
--    verifica non risponde entro 5 secondi (in cantiere succede);
--  · qualunque client diverso da quella schermata (app, chiamata diretta
--    all'API con un token valido) non controllava niente.
-- Per un dipendente licenziato — il caso per cui la funzione esiste — voleva
-- dire che continuava a vedere tutto finche' teneva l'app aperta.
--
-- QUESTA MIGRAZIONE NON CANCELLA E NON MODIFICA ALCUN DATO. Bloccare riguarda
-- l'accesso, non il contenuto: rapportini, timbrature, commesse, note e ore
-- della persona restano dove sono e a suo nome. E' esattamente il contrario
-- della cancellazione, ed e' il motivo per cui `delete-company-user` dice
-- «disattivalo invece di eliminarlo».
--
-- Il controllo si mette dove il database decide gia' tutto il resto. Due
-- funzioni reggono le policy di tutto lo schema — `has_role` (790 policy) e
-- `get_user_company_id` (329) — ed entrambe hanno gia' esattamente questa
-- forma: una guardia centrale, `chiamante_anonimo()`, in testa a un CASE.
-- Se ne aggiunge una seconda accanto, e il blocco vale ovunque in un colpo
-- solo, senza toccare una singola policy.
--
-- `utente_bloccato()` deve essere SECURITY DEFINER per due ragioni, non una:
-- legge `profiles`, che ha RLS, e un utente bloccato potrebbe non vedere la
-- propria riga (la guardia si spegnerebbe da sola, come e' gia' successo con
-- only_assigned); e soprattutto le policy DI `profiles` chiamano queste stesse
-- funzioni — senza il definer la lettura rientrerebbe nell'RLS e andrebbe in
-- ricorsione. `profiles` non ha FORCE ROW LEVEL SECURITY e il proprietario e'
-- postgres, quindi il definer la scavalca davvero.
--
-- Chi NON viene toccato: `service_role` (auth.uid() e' NULL, quindi mai
-- bloccato: le edge function continuano a lavorare) e chiunque non abbia il
-- flag. Chi viene toccato: i 529 profili gia' bloccati, tutti di ruolo
-- `customer` creati dall'import clienti, nessuno dei quali ha MAI fatto
-- accesso — quindi nessuno che oggi lavora resta fuori.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.utente_bloccato()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND coalesce(is_blocked, false)
  );
$function$;

REVOKE ALL ON FUNCTION public.utente_bloccato() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utente_bloccato() TO authenticated, service_role;

-- Le due funzioni restano identiche in tutto: cambia solo il ramo aggiunto.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.chiamante_anonimo() THEN false
    WHEN public.utente_bloccato()   THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role = _role
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.chiamante_anonimo() THEN NULL::uuid
    WHEN public.utente_bloccato()   THEN NULL::uuid
    ELSE (SELECT company_id FROM public.profiles WHERE id = _user_id)
  END;
$function$;
