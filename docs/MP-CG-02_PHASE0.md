# FASE 0 — MP-CG-02 (RPC CE Riclassificato + BEP + Mensile)

Branch: `feat/controllo-gestione-mp1` (continua da MP-CG-01 — l'utente ha richiesto NO push su main; tutto in locale sulla stessa feature branch).

## Tabelle/colonne attese vs reale (mapping)
| Atteso dal prompt | Reale | Adattamento |
|---|---|---|
| `auth_company_id()` | non esiste | `get_my_company_id()` |
| `auth_has_role('super_admin')` | non esiste | `has_role(auth.uid(), 'super_admin'::app_role)` |
| `orders.deleted_at` | non esiste | skip filtro |
| `orders.stato` | non esiste (`current_status_id` è FK a `order_statuses`) | variazione rim. lav. in corso = 0 (nessun campo `importo_realizzato` né `data_chiusura`) |
| `orders.importo_realizzato` | non esiste | n/a |
| `orders.importo_fatturato` | non esiste | n/a |
| `orders.data_chiusura` | non esiste | n/a |
| `cedolini.periodo_competenza` | non esiste; usa `mese` (int) + `anno` (int) | filtro `cedolini.anno = p_anno AND mese BETWEEN p_mese_da AND p_mese_a` |
| `cedolini.lordo_dipendente` | è `lordo` | rinominato |
| `cedolini.contributi_datore` | OK | |
| `cedolini.tfr_quota_mese` | non esiste | escluso dalla somma costo personale |
| `cedolini.altri_oneri` | non esiste | escluso |
| `cedolini.stato IN ('emesso','pagato')` | OK (`stato` esiste come text) | |
| `inventory` table per `var_rim_mag` | non esiste (solo `inventory_audits`) | variazione rim. magazzino = 0 |

## Decisioni
1. **Variazione rimanenze** (lavori in corso + magazzino) → impostate a 0 in attesa di modello dedicato. La RPC ritorna comunque le voci con valore 0 per coerenza struttura.
2. **Costo personale**: se esistono cedolini per l'anno → `SUM(lordo + contributi_datore)`; altrimenti fallback a `v_cg_costi_classificati` macro `costo_personale`.
3. **Override**: applicati per `macro_voce` come da prompt (somma tra costi base e override).
4. **RLS check** in head di RPC: `IF p_company_id != get_my_company_id() AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN RAISE EXCEPTION`.
5. **Aliquota imposte default** = 27.50% (IRES+IRAP indicativa) come da prompt.
