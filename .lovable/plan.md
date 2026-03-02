

# Expanded Row — Ripensata per Super Admin SaaS

## Cosa rimuovere (dati irrilevanti o già in tabella)
- **Sparkline Trend Ordini** — esplicitamente non richiesto, elimina anche la query `sparklineData` dal passaggio props
- **Card "Utenti"** — già nella colonna tabella
- **Card "Staff"** — boolean a basso valore
- **Card "Ultimo Ordine"** — ridondante con Last Access + Health in tabella

## Cosa aggiungere (dati da Super Admin SaaS)
- **Utilizzo Piano** — Barre progresso "Ordini X/Y" e "Utenti X/Y" con colore upsell (verde < 70%, arancione 70-90%, rosso > 90%). Richiede espandere la query companies per includere `max_orders, max_users` dal piano
- **Metodo Pagamento** — Badge "Carta configurata" / "Nessun pagamento" con icona, dato già presente in `company.payment_method`
- **LTV Cliente** — Rinominare "Valore Totale" in "LTV Cliente" (stesso dato `orderStats.totalValue`)

## Layout finale expanded row (3 righe)

**Riga 1 — KPI operativi (4 card)**
| LTV Cliente | Utilizzo Ordini (barra X/Y) | Utilizzo Utenti (barra X/Y) | Onboarding % |

**Riga 2 — Stato Pagamento + Contatto rapido**
| Badge pagamento | Email | Chiama | Nota rapida |

**Riga 3 — Intelligence (come oggi)**
| Next Actions (se presenti) |
| Health Breakdown (compatto) |
| Business Info (condizionale) |
| CRM Notes + Tags |

## File modificati

1. **`src/pages/admin/CompaniesList.tsx`**
   - Espandere la select companies: `subscription_plans:subscription_plan_id(id, name, price_monthly, max_orders, max_users)`
   - Passare `planLimits` (max_orders, max_users) e `userCount` al `CompanyExpandedRow`
   - Rimuovere passaggio `sparklineData` prop

2. **`src/components/admin/company/CompanyExpandedRow.tsx`**
   - Riscrivere Section 1: 4 card (LTV, Utilizzo Ordini con barra, Utilizzo Utenti con barra, Onboarding)
   - Section 2: Badge pagamento + quick contact inline
   - Rimuovere sparkline import e rendering
   - Aggiungere props `planLimits` e `userCount`

Nessuna migrazione DB, nessun nuovo file.

