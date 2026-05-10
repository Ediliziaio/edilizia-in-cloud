#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# generate-oauth-secrets.sh — helper per setup OAuth Gmail/Outlook in production
# ────────────────────────────────────────────────────────────────────────────
# Genera in modo sicuro:
#   1. app.email_oauth_encryption_key (AES-256, hex 64 char) per encrypt tokens
#   2. PROACTIVE_CRON_SECRET (random 48 char) per pg_cron → edge auth
#   3. INBOUND_EMAIL_SECRET (random 48 char) per Resend/Mailgun webhook
#
# Output: comandi pronti da copy-paste nel SQL Editor + Supabase Dashboard.
#
# NB: ognuna di queste chiavi va settata SOLO UNA VOLTA. Cambiarla
# successivamente invalida i tokens cifrati esistenti!
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

if ! command -v openssl &>/dev/null; then
  echo "❌ openssl non trovato. Installa con: brew install openssl"
  exit 1
fi

ENCRYPTION_KEY=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 24)
INBOUND_SECRET=$(openssl rand -hex 24)

cat <<EOF

═══════════════════════════════════════════════════════════════════════
SECRETS GENERATI — copia DOVE INDICATO sotto
═══════════════════════════════════════════════════════════════════════

📋 STEP 1: SQL Editor di Supabase Studio
─────────────────────────────────────────
Incolla ed esegui:

ALTER DATABASE postgres SET app.email_oauth_encryption_key = '${ENCRYPTION_KEY}';
ALTER DATABASE postgres SET app.proactive_cron_secret      = '${CRON_SECRET}';
ALTER DATABASE postgres SET app.supabase_url               = 'https://rsbrguhkodgnqfomrevo.supabase.co';

-- Verifica
SHOW app.email_oauth_encryption_key;
SHOW app.proactive_cron_secret;


📋 STEP 2: Supabase Dashboard → Settings → Edge Functions → Secrets
────────────────────────────────────────────────────────────────────
Aggiungi questi secrets (Add new secret per ognuno):

PROACTIVE_CRON_SECRET = ${CRON_SECRET}
INBOUND_EMAIL_SECRET  = ${INBOUND_SECRET}

(Le 4 chiavi GOOGLE_OAUTH_* e MS_OAUTH_* le aggiungerai DOPO aver
fatto Step 3+4 per Google Cloud + Microsoft Entra ID — vedi
scripts/SETUP-EMAIL-OAUTH.md)


📋 STEP 3: Test setup
─────────────────────
Vai su /azienda/impostazioni/integrazioni come company_admin.
La card "Email Triage AI" mostrerà la diagnostica live di tutti i secret
configurati / mancanti, in tempo reale (refresh ogni 60s).


⚠️ SICUREZZA
─────────────
- Non committare mai questi valori in git.
- Salvali in 1Password/Bitwarden/Vault sotto "EdiliziaInCloud OAuth secrets".
- Se cambi encryption_key, tutte le connessioni OAuth esistenti diventano
  indecifrabili (gli utenti dovranno riconnettere account).

═══════════════════════════════════════════════════════════════════════
EOF
