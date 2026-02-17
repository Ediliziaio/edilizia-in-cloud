

# Audit Dettaglio Azienda - Company Hub Super Admin

## Analisi completa dei 5 tab + hook

---

## PROBLEMI TROVATI

### 1. BUG CRITICO: Nessuna gestione errore (useCompanyDetail + CompanyDetail)
Il hook non espone `isError` ne `refetch`. Se una query fallisce, la pagina resta su loader infinito o mostra dati parziali senza feedback. Stesso bug gia corretto in Dashboard e CompaniesList.

### 2. CODICE MORTO: Card "Azioni Rapide" in Panoramica (righe 288-307)
Il pulsante "Accedi al pannello azienda" duplica il bottone gia presente nell'header della pagina. "Visualizza ordini" e "Gestisci ticket" sono link navigabili tramite impersonificazione, ma il Super Admin puo gia usare il bottone header. Occupa spazio senza aggiungere valore.

### 3. DATI DUPLICATI: Card "Revenue" in Panoramica (righe 161-199)
La card mostra:
- "Piano attuale" -- gia visibile nella KPI card "Entrate Mensili"
- "MRR" -- identico alla KPI card "Entrate Mensili"
- "Prossimo rinnovo" e "LTV" sono utili ma possono essere integrati nelle KPI cards esistenti

### 4. DATI FALSI: Storage in SaaS tab
La barra mostra sempre "0 / X MB" hardcoded. Non c'e calcolo reale dello storage. E' fuorviante per il Super Admin -- meglio rimuoverla finche non c'e un calcolo effettivo.

### 5. PATTERN INCONSISTENTE: handleCreateSalesperson/handleCreateEmployee usano `.then()` 
Le righe 392-420 nel hook usano `.then()` callback invece di `useMutation`, creando inconsistenza con tutte le altre operazioni (updateStatus, changePlan, extendTrial). Questo rende piu difficile gestire loading state e errori.

### 6. CAST `as any`: updatePaymentMethodMutation (riga 496)
`supabase.from("companies").update(data as any)` -- il cast nasconde potenziali errori di tipo. Il tipo `data` e gia correttamente definito e puo essere passato direttamente.

### 7. DATI DUPLICATI: Sidebar in Dettagli tab
La sidebar destra (righe 293-361 di CompanyDetailsTab) mostra conteggi ordini/clienti/team e info azienda gia visibili nella Panoramica. E' ridondante per il Super Admin che puo semplicemente tornare al tab Panoramica.

### 8. DATI DUPLICATI: "Dati Fatturazione" in Abbonamento tab
La card (righe 140-190 di CompanySubscriptionTab) mostra P.IVA, PEC, SDI, sede legale in sola lettura -- tutti dati editabili nel tab Dettagli. Il Super Admin deve andare comunque in Dettagli per modificarli. Duplicazione inutile.

---

## PIANO DI INTERVENTO

### File: `src/hooks/useCompanyDetail.ts`

**Gestione errore:**
- Esporre `isError` e `refetch` dalla query principale `company-detail`
- Aggiungere al return: `isError`, `refetch`

**Conversione a useMutation:**
- Convertire `handleCreateSalesperson` da `.then()` a `useMutation` 
- Convertire `handleCreateEmployee` da `.then()` a `useMutation`
- Rimuovere stati manuali `savingSalesperson` e `savingEmployee` (sostituiti da `mutation.isPending`)

**Rimozione cast:**
- Rimuovere `as any` su riga 496, tipizzare correttamente l'update

### File: `src/pages/admin/CompanyDetail.tsx`

**Gestione errore:**
- Aggiungere stato `isError` con Alert e tasto "Riprova" (stesso pattern di Dashboard e CompaniesList)
- Importare `Alert`, `AlertTitle`, `AlertDescription` e `RefreshCw`

### File: `src/components/admin/company/CompanyOverviewTab.tsx`

**Rimozione duplicati:**
- Eliminare card "Revenue" (righe 161-199) -- MRR e Piano gia nelle KPI cards
- Spostare "Prossimo rinnovo" e "LTV" come 5a e 6a KPI card (griglia da 4 a 6 colonne su lg, 3 su md)
- Eliminare card "Azioni Rapide" (righe 288-307) -- duplica header

### File: `src/components/admin/company/CompanySaaSTab.tsx`

**Rimozione dati falsi:**
- Eliminare card "Storage" (righe 86-104) -- mostra sempre 0, dato finto

### File: `src/components/admin/company/CompanyDetailsTab.tsx`

**Snellimento sidebar:**
- Rimuovere i contatori ordini/clienti/team dalla sidebar (righe 346-359) -- duplicano Panoramica
- Mantenere solo: logo, nome, stato, settore, date, P.IVA (info contestuale utile durante l'editing)

### File: `src/components/admin/company/CompanySubscriptionTab.tsx`

**Rimozione duplicato:**
- Eliminare card "Dati Fatturazione" (righe 140-190) -- dati gia in tab Dettagli
- Cambiare layout da `lg:grid-cols-2` a layout singolo per lo Storico, o riorganizzare in modo che Stato + Pagamento occupino la riga superiore e Storico la riga inferiore (gia presente)

---

## Riepilogo modifiche

| File | Azione |
|------|--------|
| `useCompanyDetail.ts` | + isError/refetch, useMutation per salesperson/employee, rimozione `as any` |
| `CompanyDetail.tsx` | + stato errore con Alert e Riprova |
| `CompanyOverviewTab.tsx` | Rimozione Revenue card e Azioni Rapide, LTV/Rinnovo nelle KPI |
| `CompanySaaSTab.tsx` | Rimozione card Storage finta |
| `CompanyDetailsTab.tsx` | Snellimento sidebar (rimozione contatori duplicati) |
| `CompanySubscriptionTab.tsx` | Rimozione card Dati Fatturazione duplicata |

## Cosa rimane invariato (gia OK)

- Header con logo, stato e impersonificazione -- ben fatto
- KPI cards Panoramica (Valore Ordini, Valore Medio, Entrate, Salute) -- ottime
- Grafico ordini ultimi 6 mesi -- ben implementato con Recharts
- Tabelle Ultimi Ordini / Ultimi Ticket -- corrette
- Tab Dettagli: form completo con sedi legale/operativa e sincronizzazione -- solido
- Tab Team: 4 sezioni (Admin, Staff, Venditori, Dipendenti) con permessi e creazione account -- completo
- Tab SaaS: cards limiti (ordini/utenti) e griglia moduli -- funzionali
- Tab Abbonamento: stato, azioni (sospendi/riattiva/estendi), pagamento, storico -- completo
- `staleTime: 2 min` -- appropriato
- `Promise.all` per parallelizzazione -- ottimale
- Pattern `useRef` + `useEffect` per form reset -- corretto

