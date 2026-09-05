-- Offerte predefinite senza «Termini legali» collegati (in pratica: le aziende che
-- avevano già un'offerta prima della bonifica, come la Demo). Il modulo viene
-- creato se manca e collegato all'offerta, così ogni PDF esce con le parti legali.
DO $$
DECLARE
  r record;
  v_legal uuid;
BEGIN
  FOR r IN
    SELECT t.id, t.company_id
    FROM public.quote_templates t
    WHERE t.kind = 'offerta' AND t.is_default AND t.linked_legal_id IS NULL
  LOOP
    SELECT id INTO v_legal
    FROM public.quote_templates
    WHERE company_id = r.company_id AND kind = 'legali' AND is_active
    ORDER BY is_default DESC, created_at
    LIMIT 1;

    IF v_legal IS NULL THEN
      INSERT INTO public.quote_templates (company_id, kind, name, description, is_active, is_default, body_format, body_html)
      VALUES (r.company_id, 'legali', 'Termini legali', 'Diritto di ripensamento, privacy, foro competente. Modificabile.', true, false, 'markdown',
$md$# Termini legali

## Diritto di ripensamento
Per i contratti conclusi fuori dai locali commerciali con un consumatore, il committente può recedere entro 14 giorni dalla firma ai sensi degli artt. 52 e seguenti del Codice del Consumo (D.Lgs. 206/2005). Per i beni realizzati su misura o personalizzati il diritto di ripensamento non si applica (art. 59, lett. c).

## Trattamento dei dati
I dati del committente sono trattati da {{azienda.ragione_sociale}} per l'esecuzione del contratto e gli adempimenti di legge, ai sensi del Regolamento (UE) 2016/679.

## Foro competente
Per ogni controversia è competente il foro del luogo in cui ha sede {{azienda.ragione_sociale}}, salvo il foro del consumatore ove previsto per legge.
$md$)
      RETURNING id INTO v_legal;
    END IF;

    UPDATE public.quote_templates
    SET linked_legal_id = v_legal, show_legal_terms = true, updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;
