-- Le fatture ricevute non entravano più: l'indice chiedeva un permesso che il servizio
-- non aveva (16/11/2026).
--
-- Il 15/11 `20290331130000` ha creato `private.cg_nome_norm` con l'EXECUTE al solo
-- `authenticated`, e sopra ci ha messo un indice:
--   fatture_ricevute_company_cedente_norm_idx (company_id, private.cg_nome_norm(cedente_ragione_sociale))
-- L'espressione di un indice si calcola a ogni INSERT **con i permessi di chi scrive**:
-- da quel momento ogni scrittura fatta dal `service_role` è morta con
-- «permission denied for function cg_nome_norm», cioè 403.
--
-- Fuori restavano TUTTE le vie automatiche: le fatture dallo SDI (`ricevi-sdi`),
-- l'importazione oraria Openapi, l'OCR, gli allegati delle email, `billing-import`.
-- Dal 14/11 non è entrata più nessuna fattura ricevuta: l'importazione oraria
-- dell'Impresa Vulcano riprovava le stesse due e falliva ogni ora, in silenzio.
--
-- Una funzione usata dentro un indice serve a chiunque scriva su quella tabella.
set local lock_timeout = '3s';

grant execute on function private.cg_nome_norm(text) to service_role;
