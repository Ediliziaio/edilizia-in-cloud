

# Sidebar Dinamica per Impostazioni (stile GoHighLevel)

## Problema attuale
Quando si clicca "Impostazioni", si apre un layout con una **seconda sidebar separata** accanto a quella principale. L'utente vuole invece che la **sidebar principale cambi contenuto**, mostrando le voci delle impostazioni al posto del menu normale, con un pulsante "Torna indietro" in alto.

## Soluzione
La `CompanySidebar` rileva la rotta corrente: se siamo su `/azienda/impostazioni/*`, mostra il menu impostazioni; altrimenti mostra il menu principale.

## Modifiche

### 1. `src/components/layouts/CompanyLayout.tsx` (CompanySidebar)
- Importare `useLocation` da react-router-dom
- Rilevare se la rotta corrente inizia con `/azienda/impostazioni`
- Se si: mostrare nella sidebar:
  - Pulsante "Torna indietro" (naviga a `/azienda`) con icona freccia
  - Titolo "Impostazioni"
  - Le voci raggruppate per categoria (Profilo, Catalogo, Stati ordine, Fornitori, Utenti, Venditori, Staff, Sicurezza, Registro) con le stesse icone e logica admin-only gia presente in `SettingsLayout.tsx`
- Se no: mostrare il menu principale come adesso

### 2. `src/components/layouts/SettingsLayout.tsx`
- Rimuovere tutta la sidebar laterale (`<aside>`)
- Mantenere solo il div con `<Outlet />` per renderizzare il contenuto delle sotto-pagine
- Diventa un semplice wrapper senza sidebar propria

### File coinvolti
| File | Modifica |
|------|----------|
| `src/components/layouts/CompanyLayout.tsx` | Logica condizionale nella sidebar per mostrare menu impostazioni o menu principale |
| `src/components/layouts/SettingsLayout.tsx` | Rimuovere la sidebar interna, tenere solo l'Outlet |

Nessun altro file cambia: le route in `App.tsx` e le pagine wrapper restano identiche.

