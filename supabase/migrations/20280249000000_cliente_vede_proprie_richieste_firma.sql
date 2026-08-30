-- ============================================================================
-- Il cliente non poteva vedere le proprie richieste di firma.
--
-- La voce "Firma" del portale cliente non ha mai funzionato: la pagina
-- interrogava order_signature_requests, una tabella MAI esistita. L'errore
-- veniva ingoiato e al cliente compariva sempre "Nessun documento da firmare",
-- anche con richieste in attesa.
--
-- Sistemata la pagina (ora legge signature_requests, quella vera) resta il
-- secondo ostacolo: su signature_requests non c'e' nessuna policy per il
-- ruolo cliente. Le policy esistenti coprono lo staff dell'azienda e
-- l'accesso pubblico via header x-signature-token (la pagina /firma/<token>
-- aperta dal link ricevuto per email). Un cliente autenticato nel portale
-- non rientra in nessuna delle due, quindi vedrebbe comunque zero righe.
--
-- Qui si aggiunge la lettura, e SOLO la lettura, delle richieste indirizzate
-- a lui. Il criterio e' signer_email: e' la colonna che dice a chi e' rivolta
-- la richiesta ed e' valorizzata su tutte le righe esistenti. Stesso schema
-- gia' in uso per gli appuntamenti (customer_view_own_appointments, che
-- confronta l'email del contatto collegato con get_auth_email()).
--
-- Sulla visibilita' del token: la policy espone anche signature_requests.token
-- alla persona la cui email coincide con signer_email — cioe' esattamente la
-- persona a cui quel token e' gia' stato spedito via email. Non allarga quindi
-- l'accesso: cambia solo il modo di arrivarci (dal portale invece che dal
-- link). La firma continua a passare da /firma/<token>, con consenso, OTP,
-- IP e hash del documento: nessuna scorciatoia e nessuna firma piu' debole.
--
-- Nessun permesso di scrittura: il cliente non puo' modificare la richiesta
-- da qui. L'unica UPDATE possibile resta quella per token (public_update_by_token),
-- vincolata a status 'pending' -> 'signed'.
-- ============================================================================

DROP POLICY IF EXISTS customer_view_own_signature_requests ON public.signature_requests;

CREATE POLICY customer_view_own_signature_requests
  ON public.signature_requests
  FOR SELECT
  TO authenticated
  USING (
    signer_email IS NOT NULL
    AND public.get_auth_email() IS NOT NULL
    AND lower(signer_email) = lower(public.get_auth_email())
  );

COMMENT ON POLICY customer_view_own_signature_requests ON public.signature_requests IS
  'Sola lettura: il cliente autenticato vede le richieste di firma indirizzate alla propria email (portale /cliente/firma). La firma resta su /firma/<token>.';
