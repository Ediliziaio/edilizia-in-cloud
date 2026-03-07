

# Rimuovere sottovoci AI dalla sidebar

## Problema
La sidebar marketing contiene 3 voci che sono sotto-pagine del modulo AI Agents e non dovrebbero apparire come voci principali: **KB Globale**, **Numeri Telefono**, **Crediti AI**. Queste pagine sono già accessibili tramite la navigazione interna del modulo (`AgentSidebar.tsx`).

## Modifica

**File: `src/lib/sidebarConfig.ts`**
- Rimuovere le righe 68-70 (`KB Globale`, `Numeri Telefono`, `Crediti AI`) dall'array `marketingNavItems`
- Rimuovere le import inutilizzate (`Database`, `CreditCard`, `Phone`) se non usate altrove

L'array risultante avrà le voci: Dashboard, Contatti, Opportunità, Attività, Appuntamenti, Automazioni, **Agenti AI**, Email Marketing, WhatsApp, Reportistica — corrispondente allo screenshot di riferimento.

