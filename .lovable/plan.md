
# Audit Tecnico Completo + Piano Ottimizzazioni P2/P3

## Stato Attuale — COMPLETATO ✅

### Interventi Eseguiti

#### P0 — Sicurezza Critica ✅
| # | Problema | Stato | Azione |
|---|----------|-------|--------|
| 1 | Leaked Password Protection disabilitata | ⚠️ Manuale | Da abilitare in Cloud → Auth → Security |
| 2 | `profiles` policy con ruolo `authenticated` | ✅ OK | Gia' corretto — policies usano `TO authenticated` |
| 3 | `order_salespeople` policy con ruolo `public` | ✅ FIXATO | Migrato a `TO authenticated` |
| 4 | `article_templates` policy con ruolo `public` | ✅ FIXATO | Migrato a `TO authenticated` |

#### P2 — Performance ✅
| # | Ottimizzazione | Stato |
|---|----------------|-------|
| 1 | Quick Login Popover: limite 50 + ricerca server-side | ✅ |
| 2 | Admin Stat Cards: click handler navigazione | ✅ |
| 3 | DB functions aggregate | ✅ |
| 4 | AdminSidebar: `.limit(50)` + `.ilike()` server-side + debounce 300ms | ✅ |
| 5 | SubscriptionPlans: RPC `get_plan_company_counts()` | ✅ |

#### P1 — Bug Fix
| # | Problema | Stato | Note |
|---|----------|-------|------|
| 1 | forwardRef warning SubscriptionPlans | ✅ N/A | DialogHeader/Footer gia' wrappati in forwardRef nel nostro dialog.tsx |

### Azione Residua
- **Leaked Password Protection**: abilitare manualmente da Cloud → Authentication → Security. Non configurabile via codice.
