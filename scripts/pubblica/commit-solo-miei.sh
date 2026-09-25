#!/usr/bin/env bash
# Commit da pubblicare con SOLO i file indicati, costruito sopra origin/main.
#
# La cartella del repository è condivisa da più sessioni: il main locale ha
# commit e modifiche di altri che non tocca a noi pubblicare. Questo script
# prende i file indicati com'erano nell'ultimo commit locale (HEAD), li mette
# sopra origin/main in un indice temporaneo e crea il commit. NON fa push:
# stampa il comando, che si lancia solo col sì di Florin.
#
# Si ferma se:
#   - un file ha modifiche non committate (prima: git commit -- <file>);
#   - un file è cambiato su origin/main dopo l'ultimo aggiornamento della
#     cartella (prima: git merge origin/main, poi si riprova);
#   - non c'è niente di diverso da origin/main.
#
# Uso:
#   scripts/pubblica/commit-solo-miei.sh -c <commit> file…     messaggio preso da quel commit
#   scripts/pubblica/commit-solo-miei.sh -m "messaggio" file…
#   scripts/pubblica/commit-solo-miei.sh -F messaggio.txt file…
set -euo pipefail

messaggio=""
da_file=""
da_commit=""
while getopts "m:F:c:" opzione; do
  case "$opzione" in
    m) messaggio="$OPTARG" ;;
    F) da_file="$OPTARG" ;;
    c) da_commit="$OPTARG" ;;
    *) echo "Uso: $0 (-m messaggio | -F file | -c commit) file…" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
if [ $# -eq 0 ]; then
  echo "Nessun file indicato." >&2
  exit 2
fi
if [ -z "$messaggio$da_file$da_commit" ]; then
  echo "Serve il messaggio: -m, -F oppure -c <commit>." >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin
base=$(git rev-parse origin/main)
comune=$(git merge-base HEAD origin/main)

fermo=0
for f in "$@"; do
  if [ -n "$(git ls-files --others --exclude-standard -- "$f")" ]; then
    echo "FERMO: $f non è committato (git add + git commit -- $f)." >&2
    fermo=1
    continue
  fi
  if ! git diff --quiet HEAD -- "$f"; then
    echo "FERMO: $f ha modifiche non committate (git commit -- $f)." >&2
    fermo=1
    continue
  fi
  su_origin=$(git rev-parse -q --verify "origin/main:$f" 2>/dev/null || echo "assente")
  al_punto_comune=$(git rev-parse -q --verify "$comune:$f" 2>/dev/null || echo "assente")
  if [ "$su_origin" != "$al_punto_comune" ]; then
    echo "FERMO: $f è cambiato su origin/main dopo l'ultimo aggiornamento: prima git merge origin/main, poi riprova." >&2
    fermo=1
  fi
done
if [ "$fermo" -ne 0 ]; then
  exit 1
fi

indice=$(mktemp -t indice-pubblica.XXXXXX)
rm -f "$indice"
trap 'rm -f "$indice"' EXIT
GIT_INDEX_FILE="$indice" git read-tree "$base"
for f in "$@"; do
  if git cat-file -e "HEAD:$f" 2>/dev/null; then
    modo=$(git ls-tree HEAD -- "$f" | awk '{print $1}')
    GIT_INDEX_FILE="$indice" git update-index --add --cacheinfo "$modo,$(git rev-parse "HEAD:$f"),$f"
  else
    # Tolto nel commit locale: si toglie anche da quello da pubblicare.
    GIT_INDEX_FILE="$indice" git update-index --force-remove -- "$f"
  fi
done
albero=$(GIT_INDEX_FILE="$indice" git write-tree)

if git diff --quiet "$base" "$albero"; then
  echo "Niente da pubblicare: questi file sono già uguali su origin/main." >&2
  exit 1
fi

file_messaggio=$(mktemp -t messaggio-pubblica.XXXXXX)
trap 'rm -f "$indice" "$file_messaggio"' EXIT
if [ -n "$da_commit" ]; then
  git log -1 --format=%B "$da_commit" > "$file_messaggio"
elif [ -n "$da_file" ]; then
  cat "$da_file" > "$file_messaggio"
else
  printf '%s\n' "$messaggio" > "$file_messaggio"
fi
commit=$(git commit-tree "$albero" -p "$base" -F "$file_messaggio")

echo "Commit pronto: $commit, sopra origin/main $(git rev-parse --short "$base")."
echo
git diff --stat "$base" "$commit"
for f in "$@"; do
  if git diff --quiet "$base" "$commit" -- "$f"; then
    echo "Nota: $f era già uguale su origin/main." >&2
  fi
done
echo
echo "Per pubblicarlo (solo col sì di Florin):"
echo "  git push origin $commit:main"
