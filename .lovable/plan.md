
# QA e Stabilizzazione - Email Marketing Module

## Risultato Analisi

Il modulo e ben strutturato e funzionale. Ho identificato **3 bug** e **1 miglioramento UX** da correggere.

---

## 1. Bug: Duplicazione campagna perde `json_content`

In `EmailCampaignsTab.tsx` (riga 121-134), la mutation `duplicateMutation` non include il campo `json_content` nel payload di inserimento. Se una campagna e stata creata con il builder drag-and-drop, la copia perde tutto il design visuale.

**Fix**: Aggiungere `json_content: campaign.json_content` nel payload della duplicazione.

---

## 2. Bug: Click su campagna builder porta all'editor sbagliato

In `EmailCampaignsTab.tsx` (riga 310), il click su una campagna naviga sempre a `/editor`. Se la campagna ha `json_content` popolato (creata con il builder), dovrebbe navigare a `/builder` per riaprire il design visuale.

**Fix**: Condizionare la navigazione: se `c.json_content` esiste e non e vuoto, navigare a `/builder`, altrimenti a `/editor`.

---

## 3. Bug: Select formato blocco nel CampaignEditor ha valore statico

In `CampaignEditor.tsx` (riga 284), il `Select` per il formato testo ha `value="paragraph"` hardcoded. Nonostante il `onValueChange` funzioni correttamente per applicare il formato, il valore mostrato nel dropdown rimane sempre "Paragrafo" indipendentemente dalla selezione effettiva.

**Fix**: Gestire lo stato del formato con un `useState` e aggiornarlo sia alla selezione che al focus nel contenuto.

---

## 4. UX: Duplica campagna con feedback navigazione

Quando si duplica una campagna, aggiungere il messaggio "Campagna duplicata" nel toast (gia presente) - confermato ok.

---

## Riepilogo Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Bug fix | `EmailCampaignsTab.tsx` | Aggiungere `json_content` alla duplicazione |
| Bug fix | `EmailCampaignsTab.tsx` | Navigazione condizionale editor/builder |
| Bug fix | `CampaignEditor.tsx` | Stato reattivo per formato blocco |

### Nessuna modifica database necessaria
