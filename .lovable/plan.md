

# Pulizia Codice Morto - Impostazioni

## Analisi completata

Tutte le 9 sezioni delle impostazioni sono state verificate e funzionano correttamente:

| Sezione | Componente interno | Stato |
|---------|-------------------|-------|
| Profilo aziendale | LogoUploader + CompanyProfileForm | OK - salva su database e storage |
| Catalogo articoli | ArticleCatalog | OK - CRUD articoli |
| Stati ordine | OrderStatusConfig | OK - drag and drop con riordinamento |
| Fornitori | SuppliersConfig | OK - CRUD fornitori |
| Utenti | UsersConfig | OK - gestione staff (solo admin) |
| Venditori | SalespeopleConfig | OK - gestione venditori (solo admin) |
| Staff / Operai | Employees (pagina riusata) | OK - gestione dipendenti (solo admin) |
| Cambio password | ChangePasswordForm | OK - cambio password via auth |
| Registro attivita | CompanyActivityLogTab | OK - log azioni (solo admin) |

La sidebar dinamica in `CompanyLayout.tsx` gestisce correttamente la visibilita condizionale (admin-only per Team e Registro) e il pulsante "Torna indietro".

## Codice morto trovato

Un solo file morto da eliminare:

- **`src/pages/azienda/Settings.tsx`** - Contiene solo un redirect (`Navigate to /azienda/impostazioni/profilo`), ma non e importato da nessun file. Il routing in `App.tsx` usa direttamente `SettingsLayout` con le sotto-route. Questo file e un residuo della migrazione dalle tab alla sidebar e puo essere eliminato.

## Azione

| File | Azione |
|------|--------|
| `src/pages/azienda/Settings.tsx` | Eliminare - non importato da nessuna parte |

Nessun'altra modifica necessaria. Il resto del codice e pulito e tutte le integrazioni sono corrette.

