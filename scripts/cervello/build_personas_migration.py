#!/usr/bin/env python3
"""
Genera migration SQL atomica con 19 UPDATE su ai_personas.

Estrae system_prompt da ogni file ~/Downloads/{NN}-{persona}.md:
  - tutto dopo la PRIMA riga "---" e PRIMA della riga "[NOTE TECNICHE...]"
  - kb_areas_filter NON modificato (i file non lo specificano in modo parsabile;
    Silvio è gia NULL nel DB; le altre conservano il valore esistente).
  - system_prompt_version: incrementato di 1
  - system_prompt_updated_at: now()

Output: file SQL in supabase/migrations/ + copia in scripts/ per Dashboard SQL Editor.
"""
from __future__ import annotations
import os
import re
import sys
from pathlib import Path

SOURCE_DIR = Path.home() / "Downloads"
OUT_MIGRATION = Path("/Users/agenteai/edilizia-in-cloud/supabase/migrations/20270201000100_mp_personas_19_prompts.sql")
OUT_SCRIPT = Path("/Users/agenteai/edilizia-in-cloud/scripts/mp_personas_19_prompts.sql")

KEY_MAP = {
    "00-silvio-meta-founder": "silvio",
    "01-cfo": "cfo",
    "02-commercialista": "commercialista",
    "03-controller": "controller",
    "04-legale": "legale",
    "05-tecnico": "tecnico",
    "06-assistente-imprenditore": "assistente_imprenditore",
    "07-pm-cantiere": "pm_cantiere",
    "08-hr": "hr",
    "09-sales": "sales",
    "10-direttore-vendite": "direttore_vendite",
    "11-direttore-marketing": "direttore_marketing",
    "12-amministrazione": "amministrazione",
    "13-acquisti": "acquisti",
    "14-compliance": "compliance",
    "15-cliente-tutor": "cliente_tutor",
    "16-capocantiere": "capocantiere",
    "17-assistente-cliente": "assistente_cliente",
    "18-brain-sistema": "brain",
}


def extract_prompt(path: Path) -> str:
    """Estrae il blocco prompt: dopo la prima '---', prima di '[NOTE TECNICHE...'."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    # Trova la prima riga "---" standalone
    first_dash_idx = None
    for i, line in enumerate(lines):
        if line.strip() == "---":
            first_dash_idx = i
            break
    if first_dash_idx is None:
        first_dash_idx = -1  # parti da inizio

    # Trova "[NOTE TECNICHE..."
    note_idx = None
    for i, line in enumerate(lines):
        if line.lstrip().startswith("[NOTE TECNICHE"):
            note_idx = i
            break

    if note_idx is None:
        chunk = lines[first_dash_idx + 1 :]
    else:
        chunk = lines[first_dash_idx + 1 : note_idx]

    return "\n".join(chunk).strip()


def main() -> int:
    parts: list[str] = []
    parts.append("""\
-- ════════════════════════════════════════════════════════════════════════════
-- MP-Personas — Apply 19 system prompts (Sprint 2 Cervello Supremo)
-- ════════════════════════════════════════════════════════════════════════════
-- Generato da scripts/cervello/build_personas_migration.py dai file
-- ~/Downloads/{NN}-{persona}.md (Cervello Supremo persona-system-prompts).
--
-- Estrazione:
--   - system_prompt = tutto dopo la PRIMA riga "---" e PRIMA della
--     riga "[NOTE TECNICHE...]" (escluse). La sezione note è metadata.
--   - kb_areas_filter NON modificato: i file non lo specificano in modo
--     parsabile. Silvio resta NULL (default), le altre conservano il valore.
--   - system_prompt_version: incrementato di 1
--   - system_prompt_updated_at: now()
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
""")

    count = 0
    for stem, key in KEY_MAP.items():
        path = SOURCE_DIR / f"{stem}.md"
        if not path.exists():
            print(f"WARN: file mancante {path}", file=sys.stderr)
            continue
        prompt = extract_prompt(path)
        if not prompt:
            print(f"WARN: prompt vuoto per {stem}", file=sys.stderr)
            continue

        parts.append(f"""
-- ─── {key} ({path.name}) ───
UPDATE public.ai_personas
SET
  system_prompt = $persona${prompt}
$persona$,
  system_prompt_version = COALESCE(system_prompt_version, 1) + 1,
  system_prompt_updated_at = now()
WHERE persona_key = '{key}';
""")
        count += 1

    parts.append("""
-- ─── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total int;
  v_updated_recent int;
BEGIN
  SELECT count(*) INTO v_total FROM public.ai_personas;
  SELECT count(*) INTO v_updated_recent FROM public.ai_personas
    WHERE system_prompt_updated_at > now() - interval '1 minute';
  RAISE NOTICE 'MP-Personas: % personas totali, % aggiornate ora', v_total, v_updated_recent;
  IF v_updated_recent < 19 THEN
    RAISE WARNING 'Attese 19 update, registrate solo %', v_updated_recent;
  END IF;
END $$;

COMMIT;
""")

    OUT_MIGRATION.write_text("\n".join(parts), encoding="utf-8")
    OUT_SCRIPT.write_text("\n".join(parts), encoding="utf-8")
    print(f"OK: {count} UPDATE generati")
    print(f"     migration: {OUT_MIGRATION}")
    print(f"     script:    {OUT_SCRIPT}")
    print(f"     size:      {OUT_MIGRATION.stat().st_size} bytes")
    return 0 if count == 19 else 1


if __name__ == "__main__":
    sys.exit(main())
