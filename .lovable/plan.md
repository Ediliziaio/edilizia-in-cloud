

## Miglioramenti Report Chiamate e Venditori

### Interventi pianificati

#### 1. Componente KPICard condiviso
Estrarre `KPICard` (duplicato identico in `CallCenterKPISection` e `KPISection` venditori) in `src/components/reporting/shared/KPICard.tsx`. Entrambe le sezioni KPI lo importeranno da lì.

#### 2. Insights automatici per Call Center
Creare `src/components/reporting/callcenter/CallCenterInsights.tsx` — stesso pattern di `VenditoriInsights.tsx`:
- Speed to Lead critico (>60 min media) o eccellente (<5 min)
- Tasso contatto sotto 40% = danger, sopra 60% = success
- Lead non lavorati (pct_lead_lavorati <70%) = warning
- Show-up rate < 50% = danger
- Appuntamenti / contattati <10% = warning, >20% = success
- Alta produttività (chiamate/gg >80) = success
- Anomalia: tasso contatto alto ma pochi appuntamenti → problema nello script

Aggiungere nella tab "Panoramica" sotto le card KPI.

#### 3. Confronto operatori nel Call Center
Creare `src/components/reporting/callcenter/OperatoriConfronto.tsx` — stesso layout di `VenditoriConfronto.tsx` con barre comparative:
- Campi: Appuntamenti, Tasso contatto, Speed to Lead, Tasso app su contattati, Lead lavorati %, Chiamate/giorno, Durata media, Show-up %
- Aggiungere come nuova sub-tab "Confronto" nel `CallCenterReport`

#### 4. Deduplicazione query KPI Call Center
Nel `CallCenterReport.tsx`, quando `operatoreId === "tutti"`, evitare la seconda query `useCallCenterKPI(periodo, effectiveOpId)` — il dato è già disponibile da `kpiList`. Rimuovere `kpiFiltered` quando non necessario.

#### 5. Memoizzazione VenditoriConfronto
Wrappare `VenditoriConfronto` con `memo()` e memoizzare `CompareRow` per evitare re-render completi ad ogni cambio selezione.

#### 6. Lazy loading trend venditori
Caricare `useVendorTrend` solo quando `activeTab === "trend"` o `activeTab === "overview"` (dove serve per insights). Aggiungere `enabled` condizionale.

### File coinvolti

| File | Azione |
|---|---|
| `src/components/reporting/shared/KPICard.tsx` | Nuovo — componente condiviso |
| `src/components/reporting/callcenter/CallCenterKPISection.tsx` | Modifica — importa KPICard condiviso |
| `src/components/reporting/venditori/KPISection.tsx` | Modifica — importa KPICard condiviso |
| `src/components/reporting/callcenter/CallCenterInsights.tsx` | Nuovo — insights automatici |
| `src/components/reporting/callcenter/OperatoriConfronto.tsx` | Nuovo — confronto operatori |
| `src/components/reporting/callcenter/CallCenterReport.tsx` | Modifica — tab confronto, insights, dedup query |
| `src/components/reporting/venditori/VenditoriConfronto.tsx` | Modifica — memo() |
| `src/components/reporting/venditori/VenditoriPerformanceReport.tsx` | Modifica — lazy loading trend |

