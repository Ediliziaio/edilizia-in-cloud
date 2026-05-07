#!/usr/bin/env bash
# Genera la migration SQL atomica con 19 UPDATE su ai_personas.
# Estrae system_prompt da ogni file (tutto dopo PRIMA "---" fino a [NOTE TECNICHE]).
# kb_areas_filter: NON modificato (preserviamo i valori esistenti) — solo Silvio
# avrebbe sezione esplicita "[KB AREAS FILTER]" e dice NULL (già il default per Silvio).

set -eo pipefail
SOURCE_DIR="$HOME/Downloads"
OUT="/Users/agenteai/edilizia-in-cloud/supabase/migrations/20270201000100_mp_personas_19_prompts.sql"
SCRIPT_OUT="/Users/agenteai/edilizia-in-cloud/scripts/mp_personas_19_prompts.sql"

# Mapping filename → persona_key
declare -A KEY_MAP=(
  ["00-silvio-meta-founder"]="silvio"
  ["01-cfo"]="cfo"
  ["02-commercialista"]="commercialista"
  ["03-controller"]="controller"
  ["04-legale"]="legale"
  ["05-tecnico"]="tecnico"
  ["06-assistente-imprenditore"]="assistente_imprenditore"
  ["07-pm-cantiere"]="pm_cantiere"
  ["08-hr"]="hr"
  ["09-sales"]="sales"
  ["10-direttore-vendite"]="direttore_vendite"
  ["11-direttore-marketing"]="direttore_marketing"
  ["12-amministrazione"]="amministrazione"
  ["13-acquisti"]="acquisti"
  ["14-compliance"]="compliance"
  ["15-cliente-tutor"]="cliente_tutor"
  ["16-capocantiere"]="capocantiere"
  ["17-assistente-cliente"]="assistente_cliente"
  ["18-brain-sistema"]="brain"
)

cat > "$OUT" <<'HEADER'
-- ════════════════════════════════════════════════════════════════════════════
-- MP-Personas — Apply 19 system prompts (Sprint 2 Cervello Supremo)
-- ════════════════════════════════════════════════════════════════════════════
-- Generato da scripts/cervello/build_personas_migration.sh dai file
-- ~/Downloads/{NN}-{persona}.md (Cervello Supremo persona-system-prompts).
--
-- Estrazione:
--   - system_prompt = tutto il contenuto dopo la PRIMA riga "---" e PRIMA della
--     riga "[NOTE TECNICHE...]" (escluse). La sezione note è metadata.
--   - kb_areas_filter NON modificato: i file non lo specificano in modo
--     parsabile (a parte Silvio = NULL, già default).
--   - system_prompt_version: incrementato di 1
--   - system_prompt_updated_at: now()
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

HEADER

extract_prompt() {
  local file="$1"
  # Trova line number della prima "---" e la riga "[NOTE TECNICHE..."
  local first_dash
  first_dash=$(grep -n "^---$" "$file" | head -1 | cut -d: -f1)
  local note_line
  note_line=$(grep -nE "^\[NOTE TECNICHE" "$file" | head -1 | cut -d: -f1)
  if [[ -z "$first_dash" ]]; then first_dash=0; fi
  if [[ -z "$note_line" ]]; then
    # No NOTE TECNICHE: take everything after first ---
    sed -n "$((first_dash + 1)),\$p" "$file"
  else
    sed -n "$((first_dash + 1)),$((note_line - 1))p" "$file"
  fi
}

for file in "$SOURCE_DIR"/0[0-9]-*.md "$SOURCE_DIR"/1[0-8]-*.md; do
  base=$(basename "$file" .md)
  key="${KEY_MAP[$base]:-}"
  if [[ -z "$key" ]]; then
    echo "WARN: no persona_key for $base, skip" >&2
    continue
  fi
  prompt_content=$(extract_prompt "$file")
  # Trim leading/trailing whitespace
  prompt_content=$(printf '%s' "$prompt_content" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  cat >> "$OUT" <<SQL
-- ─── $key ($(basename "$file")) ───────────────────────────────────────
UPDATE public.ai_personas
SET
  system_prompt = \$persona\$
$prompt_content
\$persona\$,
  system_prompt_version = COALESCE(system_prompt_version, 1) + 1,
  system_prompt_updated_at = now()
WHERE persona_key = '$key';

SQL
done

cat >> "$OUT" <<'FOOTER'

-- ─── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total int;
  v_updated_today int;
BEGIN
  SELECT count(*) INTO v_total FROM public.ai_personas;
  SELECT count(*) INTO v_updated_today FROM public.ai_personas
    WHERE system_prompt_updated_at > now() - interval '1 minute';
  RAISE NOTICE 'MP-Personas: % personas totali, % aggiornate ora', v_total, v_updated_today;
  IF v_updated_today < 19 THEN
    RAISE WARNING 'Attese 19 update, registrate solo %', v_updated_today;
  END IF;
END $$;

COMMIT;
FOOTER

# Copy per Dashboard SQL Editor
cp "$OUT" "$SCRIPT_OUT"
echo "OK: migration scritta in $OUT (e copia in $SCRIPT_OUT)"
echo "Righe totali: $(wc -l < "$OUT")"
