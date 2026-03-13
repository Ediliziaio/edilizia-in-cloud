

## CALL-REP-03: Enhancement Plan

### Current State
All 3 requested features already exist but in basic form:
- **Ranking**: Inline table in `CallCenterReport.tsx` (lines 154-195) — no sorting, no medals, no team average row, fewer columns
- **Trend**: `CallCenterTrendChart.tsx` — has daily chart + detail table but missing day-of-week aggregation and vista toggle (volumi/tassi)
- **Fonti Lead**: `FonteLeadTable.tsx` — functional but missing proportional bars, best/worst source insights, and explanatory text

### Changes

#### 1. Create `OperatoriRanking.tsx` (new file)
Full-featured ranking component with:
- Dynamic sort selector (8 sort fields) with ascending/descending toggle
- Medal icons for top 3 operators
- Semaphore-colored cells for all KPI columns (12 columns total)
- Team average footer row
- Color legend
- Replaces the inline table currently in `CallCenterReport.tsx`

#### 2. Enhance `CallCenterTrendChart.tsx`
Add:
- Vista toggle (volumi vs tassi %)
- Day-of-week aggregation chart ("Performance per Giorno della Settimana") using a second ComposedChart
- Keep existing daily detail table

#### 3. Enhance `FonteLeadTable.tsx`
Add:
- Proportional bar visualization for appointment rate
- Automatic best/worst source insights section
- Explanatory header text about why source analysis matters
- Better empty state messaging

#### 4. Update `CallCenterReport.tsx`
- Add "Ranking" sub-tab
- Import and mount `OperatoriRanking` component
- Remove inline ranking table from panoramica tab
- Pass `kpiList` and `kpiLoading` to ranking component

### Files Modified
- `src/components/reporting/callcenter/OperatoriRanking.tsx` — **new**
- `src/components/reporting/callcenter/CallCenterTrendChart.tsx` — enhanced
- `src/components/reporting/callcenter/FonteLeadTable.tsx` — enhanced
- `src/components/reporting/callcenter/CallCenterReport.tsx` — add ranking tab, remove inline table

