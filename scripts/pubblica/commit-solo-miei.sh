#!/usr/bin/env bash
# Commit da pubblicare con SOLO i file indicati, costruito sopra origin/main.
#
# La cartella del repository è condivisa da più sessioni: il main locale ha
# commit e modifiche di altri che non tocca a noi pubblicare. Questo script
# prende i file indicati come sono nell'ultimo commit locale (HEAD, letto una
# volta sola all'inizio), li mette sopra origin/main in un indice temporaneo e
# crea il commit. NON fa push: stampa il comando, che si lancia solo col sì di
# Florin.
#
# Con -c si indica il proprio commit (anche più di uno, ripetendo -c). Da lì
# viene il messaggio, e serve a controllare che nessun ALTRO commit locale non
# ancora pubblicato tocchi gli stessi file: se no si pubblicherebbe il lavoro
# di un'altra sessione dentro il proprio commit. Mai -c HEAD a occhi chiusi:
# se un'altra sessione ha fatto un merge, HEAD è il suo.
#
# Si ferma se:
#   - un percorso è una cartella, esce dal repository, o non esiste né nella
#     cartella né in HEAD né su origin/main (scritto male);
#   - un file non è committato o ha modifiche non committate;
#   - un file non è in nessuno dei commit indicati con -c;
#   - un file è toccato anche da un altro commit locale non ancora pubblicato;
#   - un file è cambiato su origin/main dopo l'ultimo aggiornamento della
#     cartella (prima: git merge origin/main, poi si riprova);
#   - non c'è niente di diverso da origin/main.
#
# Uso (percorsi relativi alla radice del repository, o assoluti dentro di lui):
#   scripts/pubblica/commit-solo-miei.sh -c <tuo commit> [-c <altro tuo commit>] file…
#   scripts/pubblica/commit-solo-miei.sh -c <tuo commit> -m "messaggio" file…
#   scripts/pubblica/commit-solo-miei.sh -c <tuo commit> -F messaggio.txt file…
set -euo pipefail

radice=$(git rev-parse --show-toplevel)
dalla_radice=$(git rev-parse --show-prefix)

messaggio=""
da_file=""
propri=()
while getopts "m:F:c:" opzione; do
  case "$opzione" in
    m) messaggio="$OPTARG" ;;
    F)
      da_file=$(cd "$(dirname "$OPTARG")" && pwd)/$(basename "$OPTARG")
      [ -f "$da_file" ] || { echo "File del messaggio inesistente: $OPTARG" >&2; exit 2; }
      ;;
    c)
      sha=$(git rev-parse -q --verify "$OPTARG^{commit}") || { echo "Commit sconosciuto: $OPTARG" >&2; exit 2; }
      propri+=("$sha")
      ;;
    *) echo "Uso: $0 -c <tuo commit> [-m messaggio | -F file] file…" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
if [ $# -eq 0 ]; then
  echo "Nessun file indicato." >&2
  exit 2
fi
if [ ${#propri[@]} -eq 0 ]; then
  echo "Serve -c <il tuo commit>: da lì il messaggio, e il controllo che nessun altro commit locale tocchi gli stessi file." >&2
  exit 2
fi
for sha in "${propri[@]}"; do
  if [ "$(git rev-list --parents -n 1 "$sha" | wc -w)" -gt 2 ]; then
    echo "FERMO: $(git log -1 --format='%h «%s»' "$sha") è un merge: indica il tuo commit, non quello di chi ha aggiornato la cartella." >&2
    exit 2
  fi
done

# I percorsi, tutti relativi alla radice: un percorso assoluto letto come
# «HEAD:/Users/…» non si trova, e il file sembrerebbe tolto.
file=()
for arg in "$@"; do
  case "$arg" in
    /*)
      case "$arg" in
        "$radice"/*) percorso=${arg#"$radice"/} ;;
        *) echo "FERMO: $arg è fuori dal repository ($radice)." >&2; exit 2 ;;
      esac
      ;;
    *) percorso="$dalla_radice$arg" ;;
  esac
  while [ "${percorso#./}" != "$percorso" ]; do percorso=${percorso#./}; done
  percorso=${percorso%/}
  case "/$percorso/" in
    */../*|*/./*) echo "FERMO: $arg contiene «..» o «.»: scrivi il percorso dalla radice." >&2; exit 2 ;;
  esac
  file+=("$percorso")
done

cd "$radice"
git fetch -q origin
base=$(git rev-parse origin/main)
testa=$(git rev-parse HEAD)
comune=$(git merge-base "$testa" "$base")

fermo=0
for f in "${file[@]}"; do
  if [ -d "$f" ] || [ "$(git cat-file -t "$testa:$f" 2>/dev/null || true)" = "tree" ]; then
    echo "FERMO: $f è una cartella: indica i file uno per uno." >&2
    fermo=1
    continue
  fi
  if [ ! -e "$f" ] && ! git cat-file -e "$testa:$f" 2>/dev/null && ! git cat-file -e "$base:$f" 2>/dev/null; then
    echo "FERMO: $f non esiste, né nella cartella né in HEAD né su origin/main: è scritto giusto?" >&2
    fermo=1
    continue
  fi
  if [ -n "$(git ls-files --others --exclude-standard -- "$f")" ]; then
    echo "FERMO: $f non è committato (git add -- $f && git commit -F <messaggio> -- $f)." >&2
    fermo=1
    continue
  fi
  if ! git diff --quiet "$testa" -- "$f"; then
    echo "FERMO: $f ha modifiche non committate (git commit -F <messaggio> -- $f)." >&2
    fermo=1
    continue
  fi

  nei_propri=0
  for sha in "${propri[@]}"; do
    if [ -n "$(git diff-tree --no-commit-id --name-only -r "$sha" -- "$f")" ]; then
      nei_propri=1
    fi
  done
  if [ "$nei_propri" -eq 0 ]; then
    echo "FERMO: $f non è in nessuno dei commit indicati con -c." >&2
    fermo=1
    continue
  fi

  # Gli altri commit locali che toccano il file, dal più recente. Uno già
  # pubblicato con un altro sha (chi usa questo script lascia in locale il
  # commit originale) si riconosce dal contenuto: la sua versione del file è
  # già nella storia di origin/main. Un commit superato da uno successivo già
  # pubblicato non conta più. Gli altri sono lavoro non pubblicato.
  pubblicate=$(git log -n 100 --format=%H "$base" -- "$f" | while read -r h; do
    git rev-parse -q --verify "$h:$f" 2>/dev/null || echo "assente"
  done)
  gia_pubblicati=()
  altri=""
  for sha in $(git rev-list --no-merges --full-history --topo-order "$base..$testa" -- "$f"); do
    versione=$(git rev-parse -q --verify "$sha:$f" 2>/dev/null || echo "assente")
    if printf '%s\n' "$pubblicate" | grep -qx "$versione"; then
      gia_pubblicati+=("$sha")
      continue
    fi
    case " ${propri[*]} " in *" $sha "*) continue ;; esac
    superato=0
    for d in ${gia_pubblicati[@]+"${gia_pubblicati[@]}"}; do
      if git merge-base --is-ancestor "$sha" "$d"; then superato=1; break; fi
    done
    [ "$superato" -eq 1 ] && continue
    altri="$altri
    $(git log -1 --format='%h %an, %ar: %s' "$sha")"
  done
  if [ -n "$altri" ]; then
    echo "FERMO: $f è toccato anche da commit locali non ancora pubblicati, non indicati con -c:$altri
  Se sono tuoi, aggiungili con -c; se no, quel lavoro non si pubblica insieme al tuo." >&2
    fermo=1
    continue
  fi

  su_origin=$(git rev-parse -q --verify "$base:$f" 2>/dev/null || echo "assente")
  al_punto_comune=$(git rev-parse -q --verify "$comune:$f" 2>/dev/null || echo "assente")
  in_locale=$(git rev-parse -q --verify "$testa:$f" 2>/dev/null || echo "assente")
  if [ "$su_origin" != "$al_punto_comune" ] && [ "$su_origin" != "$in_locale" ]; then
    echo "FERMO: $f è cambiato su origin/main dopo l'ultimo aggiornamento: prima git merge origin/main, poi riprova." >&2
    fermo=1
  fi
done
if [ "$fermo" -ne 0 ]; then
  exit 1
fi

indice=$(mktemp -t indice-pubblica.XXXXXX)
rm -f "$indice"
file_messaggio=$(mktemp -t messaggio-pubblica.XXXXXX)
trap 'rm -f "$indice" "$file_messaggio"' EXIT
GIT_INDEX_FILE="$indice" git read-tree "$base"
tolti=()
for f in "${file[@]}"; do
  if git cat-file -e "$testa:$f" 2>/dev/null; then
    modo=$(git ls-tree "$testa" -- "$f" | awk '{print $1}')
    GIT_INDEX_FILE="$indice" git update-index --add --cacheinfo "$modo,$(git rev-parse "$testa:$f"),$f"
  else
    # Tolto nel commit locale: si toglie anche da quello da pubblicare.
    GIT_INDEX_FILE="$indice" git update-index --force-remove -- "$f"
    if git cat-file -e "$base:$f" 2>/dev/null; then tolti+=("$f"); fi
  fi
done
albero=$(GIT_INDEX_FILE="$indice" git write-tree)

if git diff --quiet "$base" "$albero"; then
  echo "Niente da pubblicare: questi file sono già uguali su origin/main." >&2
  exit 1
fi

if [ -n "$da_file" ]; then
  git stripspace < "$da_file" > "$file_messaggio"
elif [ -n "$messaggio" ]; then
  printf '%s\n' "$messaggio" | git stripspace > "$file_messaggio"
else
  # Il messaggio dell'ultimo dei commit indicati.
  git log -1 --format=%B "${propri[${#propri[@]}-1]}" | git stripspace > "$file_messaggio"
fi
commit=$(git commit-tree "$albero" -p "$base" -F "$file_messaggio")

echo "Commit pronto: $commit, sopra origin/main $(git rev-parse --short "$base")."
echo
git diff --stat "$base" "$commit"
for f in "${file[@]}"; do
  if git diff --quiet "$base" "$commit" -- "$f"; then
    echo "Nota: $f era già uguale su origin/main." >&2
  fi
done
for f in ${tolti[@]+"${tolti[@]}"}; do
  echo "ATTENZIONE: questo commit CANCELLA $f da main. Controlla che sia voluto." >&2
done
echo
echo "Per pubblicarlo (solo col sì di Florin):"
echo "  git push origin $commit:main"
echo "Se origin/main si muove prima del push, il push viene rifiutato senza danni. Per ricostruirlo:"
printf '  scripts/pubblica/commit-solo-miei.sh'
for sha in "${propri[@]}"; do printf ' -c %s' "$(git rev-parse --short "$sha")"; done
if [ -n "$da_file" ]; then printf ' -F %q' "$da_file"; fi
if [ -n "$messaggio" ]; then printf ' -m %q' "$messaggio"; fi
printf ' %q' "${file[@]}"
echo
