

# Criticita' attive nel sistema

## 1. SICUREZZA -- Dati finanziari cross-tenant esposti (CRITICA)

La tabella/vista `monthly_billing_summary` **non ha policy RLS** e contiene dati sensibili come `total_margin_eur`, `total_cost_real_eur`, `total_cost_billed_eur`, `avg_cost_per_min` e `company_name` di tutte le aziende. Qualsiasi utente autenticato puo' leggere i margini finanziari di tutti i tenant.

**Fix**: Abilitare RLS e aggiungere una policy che restringe l'accesso per `company_id` tramite `get_my_company_id()`, limitando ulteriormente ai ruoli admin.

## 2. SICUREZZA -- Appointments espone ancora dati sensibili ad anonimi (CRITICA)

La policy anon `Public can check appointment slots` su `appointments` espone ancora `internal_notes`, `contact_id`, indirizzi e altri campi privati. Il fix precedente (view `public_appointment_slots`) non ha rimosso la policy originale sulla tabella.

**Fix**: Rimuovere la policy anon esistente su `appointments` e sostituirla con una che espone solo i campi necessari per la disponibilita' slot, oppure far puntare le query di booking alla view gia' creata.

## 3. SICUREZZA -- Order payment summary senza isolamento tenant (MEDIA)

La vista `order_payment_summary` non ha RLS e non ha colonna `company_id`. Totali pagamenti e saldi di ordini di altre aziende sono potenzialmente accessibili.

**Fix**: Abilitare RLS e aggiungere policy con JOIN su `orders` per verificare `company_id`.

## 4. UI -- forwardRef warning su DealHealthBadge (BASSA)

Il fix precedente non e' stato applicato correttamente. Il componente `DealHealthBadge` ha ancora `Tooltip` come elemento root passato a un contesto che tenta di assegnare un ref.

**Fix**: Il componente `Tooltip` di Radix non accetta ref direttamente. Bisogna wrappare il `<Tooltip>` in un `<div>` oppure usare `forwardRef` e passare il ref al `<TooltipTrigger>` wrapper.

## 5. AUTH -- Leaked password protection disabilitata (BASSA)

Password compromesse (presenti in data breach noti) non vengono bloccate alla registrazione.

**Fix**: Non configurabile via tool, richiede attivazione manuale nelle impostazioni Auth.

---

## Riepilogo

| # | Criticita' | Problema | Effort |
|---|-----------|----------|--------|
| 1 | **CRITICA** | `monthly_billing_summary` senza RLS, margini esposti cross-tenant | Basso (SQL) |
| 2 | **CRITICA** | Policy anon appointments ancora attiva con dati sensibili | Basso (SQL) |
| 3 | **MEDIA** | `order_payment_summary` senza isolamento tenant | Basso (SQL) |
| 4 | **BASSA** | forwardRef warning DealHealthBadge non risolto | Basso (TSX) |
| 5 | **BASSA** | Leaked password protection disabilitata | Manuale |

### Implementazione

1. **Migration SQL**: Abilitare RLS su `monthly_billing_summary` con policy admin-only per company_id; correggere/sostituire la policy anon su `appointments`; abilitare RLS su `order_payment_summary` con policy via JOIN su orders
2. **DealHealthBadge.tsx**: Wrappare `<Tooltip>` in un `<div>` container per risolvere il warning forwardRef

