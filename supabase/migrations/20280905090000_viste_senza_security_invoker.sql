-- Una vista senza `security_invoker` gira coi diritti di chi l'ha creata: le
-- policy di riga delle tabelle sotto non si applicano a chi la interroga.
--
-- Su 86 viste leggibili da `authenticated`, 59 hanno già security_invoker e 27
-- no. Ho misurato quali delle 27 perdano davvero, invece di indovinarlo:
-- utente dell'azienda 778a2c76, conta delle righe di altre aziende.
--
--   16 su 20 non perdevano niente: le policy sotto, o la WHERE della vista,
--      bastavano da sole.
--   public_appointment_slots ...... 41 righe di 4 aziende, e un anonimo le
--      vede tutte. È giusto così: è la superficie pubblica delle prenotazioni
--      ed espone solo data, ora e se lo slot è occupato. Lasciata com'è — ed è
--      anche la prova del meccanismo: `set role anon; select ... ` restituisce
--      quattro aziende, perché senza security_invoker l'RLS non si applica.
--   unified_calendar_busy_slots ... 17 righe di un'azienda estranea (non
--      quella a cui il demo ha accesso multi-company: quella è un'altra
--      ancora). Espone `summary`, cioè il titolo dell'appuntamento, che
--      contiene nomi di clienti e indirizzi. Ed era aperta ad `anon`.
--   v_quote_template_counts ....... 5 righe, tutte di un'altra azienda.
--      Poca roba, ma non c'è motivo che siano di tutti. Aperta ad `anon`.
--   admin_company_features ........ per un utente autenticato NON perdeva:
--      le due righe che il demo vede sono la sua azienda più quella a cui ha
--      un `multi_company_access` attivo. La mia prima sonda le aveva contate
--      come estranee: era la sonda a sbagliare, non la vista.
--      Restava però leggibile da `anon`, senza security_invoker: nome azienda,
--      piano, prezzo, stato abbonamento, fine prova, limiti e override, per
--      tutte e diciotto le aziende. Quello sì che andava chiuso.
--
-- Nessuna delle tre è interrogata da src/ o dalle edge function: compaiono
-- solo nei tipi generati. Chiuderle non toglie niente a nessuno.

ALTER VIEW public.admin_company_features      SET (security_invoker = true);
ALTER VIEW public.unified_calendar_busy_slots SET (security_invoker = true);
ALTER VIEW public.v_quote_template_counts     SET (security_invoker = true);

REVOKE SELECT ON public.admin_company_features      FROM anon;
REVOKE SELECT ON public.unified_calendar_busy_slots FROM anon;
REVOKE SELECT ON public.v_quote_template_counts     FROM anon;

COMMENT ON VIEW public.admin_company_features IS
  'Vista di piattaforma. security_invoker attivo: senza, mostrava piani e prezzi di tutte le aziende a chiunque, anon compreso.';
COMMENT ON VIEW public.unified_calendar_busy_slots IS
  'Occupazioni di calendario. security_invoker attivo: la colonna summary contiene titoli di appuntamenti, che non sono un dato pubblico.';
