
# Pulizia, Bug Fix e Ottimizzazione UX - Email Marketing Module

## Panoramica

L'analisi completa del modulo email marketing ha rivelato bug critici di multi-tenancy (stessa classe di bug gia corretta in `CampaignCreateDropdown`), codice morto, e problemi UX nel flusso editor.

---

## 1. Bug Critici: `company` vs `effectiveCompany`

4 file usano ancora `company` da `useAuth()` invece di `effectiveCompany`. Questo causa crash/dati vuoti quando il Super Admin impersona un'azienda.

| File | Riga | Fix |
|------|------|-----|
| `EmailCampaignsTab.tsx` | 36 | `const { company }` -> `const { effectiveCompany: company }` |
| `EmailStatsTab.tsx` | 15 | `const { company }` -> `const { effectiveCompany: company }` |
| `EmailTemplatesTab.tsx` | 20 | `const { company }` -> `const { effectiveCompany: company }` |
| `TemplateDialog.tsx` | 20 | `const { user, company }` -> `const { user, effectiveCompany: company }` |

Nota: usare l'alias `effectiveCompany: company` per evitare di dover rinominare ogni occorrenza nel file.

---

## 2. Bug: Editor formato blocco non funziona

In `CampaignEditor.tsx`, il `Select` per il formato (Paragrafo/Titolo 1/2/3) usa `onSelect` sui `SelectItem` che non funziona con Radix. Il Select ha anche `value="paragraph"` fisso (non reattivo).

**Fix**: Usare `onValueChange` sul `Select` per eseguire il comando `formatBlock`.

---

## 3. Codice morto / Import inutili

| File | Elemento | Motivo |
|------|----------|--------|
| `CampaignEditor.tsx` | `import Type` da lucide | Non usato nel JSX |

---

## 4. UX: Miglioramenti

### 4a. Editor - Salvataggio nome non intuitivo
Quando l'utente modifica il nome della campagna e preme Enter o il check, viene triggerato solo l'auto-save con 3s di delay. Se clicca immediatamente "Invia o programma", il nome potrebbe non essere salvato.

**Fix**: Nella conferma nome, fare un save immediato (non solo triggerAutoSave).

### 4b. CampaignSendSettings - Pulsante "Allega file" non funzionale
Il pulsante "Allega file" non fa nulla e non mostra feedback.

**Fix**: Aggiungere `onClick={() => toast.info("Funzionalita in arrivo")}` per coerenza con gli altri placeholder.

---

## Riepilogo Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Bug fix | `EmailCampaignsTab.tsx` | `effectiveCompany` alias |
| Bug fix | `EmailStatsTab.tsx` | `effectiveCompany` alias |
| Bug fix | `EmailTemplatesTab.tsx` | `effectiveCompany` alias |
| Bug fix | `TemplateDialog.tsx` | `effectiveCompany` alias |
| Bug fix | `CampaignEditor.tsx` | Fix Select formato blocco, rimuovere import `Type`, save immediato su conferma nome |
| UX | `CampaignSendSettings.tsx` | Feedback su "Allega file" |

### Nessuna modifica database

Tutte le modifiche sono puramente frontend.
