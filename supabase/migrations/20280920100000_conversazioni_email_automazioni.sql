-- Conversazioni: nel filo del contatto anche le email spedite dalle automazioni
-- (20/09/2026).
--
-- In Conversazioni le email in uscita erano solo quelle partite da una casella
-- collegata (email_outbox) e le campagne (email_logs). Le email di una
-- sequenza che esce dal provider (Elastic, Resend) stanno in
-- email_delivery_log, e nel filo non c'erano: quando il contatto rispondeva si
-- vedeva la risposta ma non a cosa stava rispondendo.
--
-- Il ramo nuovo legge email_delivery_log (template_type 'automation_send',
-- solo le inviate). Il contatto è in metadata.contact_id; il testo si legge
-- dal modello usato (metadata.template_id, scritto dal motore dal 20/09/2026):
-- via l'anteprima nascosta in testa, via i tag, il nome al posto del
-- segnaposto. Senza modello resta l'oggetto con una riga che lo dice.
-- (Nel filtro dell'anteprima i quantificatori sono tutti «pigri»: in Postgres
-- ne basta uno avido per rendere avida l'intera espressione, e con
-- `[^>]*>.*?</div>` spariva tutta l'email.)
--
-- La vista si aggiorna sul posto: si prende la definizione che c'è e si
-- aggiunge il ramo, invece di ricopiare a mano le altre tredici sorgenti.
-- security_invoker va ridetto: CREATE OR REPLACE VIEW senza WITH lo toglie.
-- I permessi restano quelli di prima (la leggono solo le funzioni
-- conversazioni_lista / conversazione_timeline / conversazioni_cerca).

create index if not exists idx_edl_automazioni_contatto
  on public.email_delivery_log (company_id, sent_at desc)
  where template_type = 'automation_send';

do $mig$
declare
  v_def text;
  v_ramo constant text := $ramo$
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    dl.company_id,
    'email'::text AS canale,
    'out'::text AS direzione,
    dl.recipient AS controparte,
    dl.subject AS oggetto,
    "left"(COALESCE(NULLIF(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(replace(
              regexp_replace(COALESCE(tp.html_content, ''::text), '<div style="display:none[^>]*?>.*?</div>'::text, ''::text, 'i'::text),
              '{{contact.first_name}}'::text, COALESCE(ct.first_name, ''::text)),
              '{{contatto.first_name}}'::text, COALESCE(ct.first_name, ''::text)),
            '<br\s*/?>|</(p|div|li|tr|h[1-6])>'::text, chr(10), 'gi'::text),
            '<[^>]+>|&nbsp;|&zwnj;'::text, ' '::text, 'g'::text),
            '[ \t]+'::text, ' '::text, 'g'::text),
            '[ \t]*\n[ \t]*(\n[ \t]*)+'::text, chr(10) || chr(10), 'g'::text),
            '[ \t]*\n[ \t]*'::text, chr(10), 'g'::text), chr(10) || ' '::text), ''::text),
          '✉️ Email automatica (il testo non è nel registro degli invii)'::text), 4000) AS testo,
    NULL::text AS media_url,
    dl.sent_at AS ts,
    'email_delivery_log'::text AS ref_tabella,
    dl.id AS ref_id
   FROM email_delivery_log dl
     JOIN marketing_contacts ct ON ct.company_id = dl.company_id AND ct.id =
        CASE
            WHEN (dl.metadata ->> 'contact_id'::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text THEN ((dl.metadata ->> 'contact_id'::text))::uuid
            ELSE NULL::uuid
        END
     LEFT JOIN email_templates tp ON tp.company_id = dl.company_id AND tp.id =
        CASE
            WHEN (dl.metadata ->> 'template_id'::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text THEN ((dl.metadata ->> 'template_id'::text))::uuid
            ELSE NULL::uuid
        END
  WHERE dl.template_type = 'automation_send'::text AND dl.status = 'sent'::text
$ramo$;
begin
  select pg_get_viewdef('public.v_conversazioni_messaggi'::regclass, true) into v_def;
  if v_def is null then
    raise exception 'v_conversazioni_messaggi non trovata';
  end if;
  -- Già fatto: la migrazione si può rilanciare.
  if position('email_delivery_log' in v_def) > 0 then
    return;
  end if;
  v_def := regexp_replace(v_def, ';\s*$', '');
  execute 'create or replace view public.v_conversazioni_messaggi with (security_invoker = on) as ' || v_def || v_ramo;
end
$mig$;
