

## Analisi Completa: Documento vs Implementazione + Punti Critici

---

### STATO DOCUMENTO — Cosa Manca

| # | Elemento | Stato | Priorità |
|---|----------|-------|----------|
| 1 | `segment_json` non salvato al send | ❌ BUG CRITICO | Alta |
| 2 | Stripe: acquisto pacchetti crediti | ❌ | Bassa |
| 3 | Stripe: Auto Top-up UI + edge function | ❌ | Bassa |
| 4 | `get_platform_email_stats` RPC: verificare che accetti `p_date_from`/`p_date_to` | ⚠️ Da verificare | Media |

Tutti gli altri punti del documento risultano implementati.

---

### PUNTI CRITICI — Bug e Problemi nel Codice

#### 🔴 CRITICO 1: Segmentazione mai salvata nel database

**File:** `CampaignSendSettings.tsx` (righe 140-197)

Sia `saveMut` che `sendMut` costruiscono un `payload` che **non include `segment_json`**. L'utente configura tag, sorgente e tipo contatto nella UI, ma questi valori non vengono mai scritti sulla colonna `segment_json` di `email_campaigns`. Di conseguenza, `send-email-campaign` edge function non riceve mai i filtri e **invia sempre a tutti i contatti iscritti**, ignorando la segmentazione configurata.

**Fix:** Aggiungere al payload di entrambe le mutation:
```
segment_json: recipientMode === "segment" ? {
  tags: segmentTags,
  source: segmentSource || null,
  contact_type: segmentContactType || null,
} : null
```

---

#### 🔴 CRITICO 2: `send-test-email` chiama RPC obsoleta

**File:** `supabase/functions/send-test-email/index.ts` (riga 136)

Chiama `deduct_email_credits` (vecchia RPC senza logging) invece di `deduct_email_credits_with_log`. Inoltre interroga la tabella `email_pricing` con colonna `cost_billed_per_email` per calcolare il costo — logica inconsistente rispetto al rest del sistema che usa 1 credito = 1 email. In test mode non dovrebbe detrarre crediti affatto.

---

#### 🟡 MEDIO 3: `useApiHealth` type non aggiornato

**File:** `src/hooks/useApiHealth.ts`

Il tipo `ApiServices` definisce solo `email: boolean`, ma `check-api-health` ora ritorna anche `email_marketing: boolean` e `email_transactional: boolean`. Il frontend ignora i campi granulari. Il banner `ApiHealthBanner` mostra solo "Email" generico, non distingue tra marketing e transazionale disconnesso.

---

#### 🟡 MEDIO 4: `check-api-health` usa `getClaims` potenzialmente fragile

**File:** `supabase/functions/check-api-health/index.ts` (riga 34)

Usa `auth.getClaims(token)` che non è un metodo standard dell'SDK Supabase JS v2. Funziona solo se il progetto usa una versione custom o un polyfill. 16 edge functions hanno lo stesso pattern — se l'SDK si aggiorna, tutte si rompono. Meglio usare `auth.getUser()` che è lo standard.

---

#### 🟡 MEDIO 5: Invio sequenziale 1-a-1 in `send-email-campaign`

**File:** `supabase/functions/send-email-campaign/index.ts` (riga 176)

L'invio avviene con un `for` loop sequenziale. Per campagne con >100 destinatari, la edge function potrebbe andare in timeout (limite ~60s su Deno Deploy). Non c'è batching, parallelismo, né chunking.

---

### CODICE MORTO / DUPLICATO

#### 🗑️ 1: `EmailProviderSettings.tsx` — Duplicato

**File:** `src/modules/ai-agents/components/EmailProviderSettings.tsx`

Duplica quasi interamente la logica di `src/components/admin/settings/email/EmailPricingConfig.tsx`. È ancora importato in `PlatformSettingsPage.tsx` (pagina AI agents), dove mostra una sezione "Email Provider & Pricing" ridondante rispetto alla tab dedicata in Admin Settings → Email. Andrebbe rimosso e il riferimento in `PlatformSettingsPage` sostituito con un link alla pagina corretta.

#### 🗑️ 2: `send-test-email` ha logica campaign duplicata

**File:** `supabase/functions/send-test-email/index.ts` (righe 74-146)

Il "campaign mode" (quando `campaignId` è passato) duplica logica già gestita da `send-email-campaign`. Questa branch sembra legacy e non viene invocata da nessuna parte del frontend (il frontend passa solo `{ to, campaignId }` per test singolo, mai per invio reale). Tutta la sezione post-riga-74 è codice morto.

#### 🗑️ 3: `recipientCount` non riflette la segmentazione

**File:** `CampaignSendSettings.tsx` (righe 85-97)

La query per `recipientCount` conta sempre TUTTI i contatti iscritti, senza applicare i filtri di segmentazione. Il widget sidebar mostra "~N crediti necessari" con un numero sbagliato quando l'utente filtra per segmento.

---

### RIEPILOGO AZIONI NECESSARIE

| # | Azione | Tipo | Impatto |
|---|--------|------|---------|
| 1 | Salvare `segment_json` nel payload di `saveMut` e `sendMut` | Bug fix | Critico — segmentazione non funziona |
| 2 | Rimuovere la sezione campaign-mode da `send-test-email` + usare RPC corretta | Cleanup + bug fix | Medio |
| 3 | Aggiornare `useApiHealth` con campi `email_marketing`/`email_transactional` + aggiornare `ApiHealthBanner` | Bug fix | Medio |
| 4 | Aggiornare `recipientCount` per riflettere i filtri segmentazione | Bug fix | Medio |
| 5 | Rimuovere `EmailProviderSettings.tsx` duplicato e aggiornare `PlatformSettingsPage` | Cleanup | Basso |
| 6 | Valutare batching/parallelismo in `send-email-campaign` | Improvement | Basso (futuro) |

