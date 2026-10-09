/**
 * Dal nome di un articolo al suo tipo di disegno («Finestra 2 Ante» → `finestra_2_ante`). Serve a riportare il
 * disegno automatico sui listini che esistono già (le aziende hanno i nomi del modello standard), senza assegnare a
 * mano centinaia di articoli. Quello che non si riconosce resta senza tipo (foto) e si assegna dalla schermata
 * dell'articolo: meglio nessun disegno di uno sbagliato.
 *
 * Non tocca cassonetti, tapparelle, zanzariere, accessori e porte interne/blindate: restano a foto.
 */

const chiave = (nome: string) =>
  nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[—–·\-'’`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Non si disegnano: restano con la foto. */
const ESCLUSI = /\b(cassonett|tapparell|zanzarier|coprifil|rilievi|smaltiment|trasport|porta blindata|porta a soffietto|porta battente|porta scorrevole (a scomparsa|esterno))/;

type Regola = [RegExp, string];

const PERSIANE: Regola[] = [
  [/\blibro (\d) ante/, "persiana:libro_$1_ante"],
  [/\bpacchetto (\d) ante (dx|sx)/, "persiana:pacchetto_$1_ante_$2"],
  [/\bpacchetto (\d) ante/, "persiana:pacchetto_$1_ante_dx"],
  [/\bscorrevole 2 ante sovrapposte/, "persiana:scorrevole_2_ante_sovrapposte"],
  [/\bscorrevole 2 ante/, "persiana:scorrevole_2_ante"],
  [/\bscorrevole 1 anta (dx|sx)/, "persiana:scorrevole_1_anta_$1"],
  [/\bscorrevole 1 anta/, "persiana:scorrevole_1_anta_dx"],
  [/\bangolo (\d) ante/, "persiana:angolo_$1_ante"],
  [/\bpannello fisso laterale/, "persiana:pannello_fisso_laterale_dx"],
  [/\bpannello fisso superiore/, "persiana:pannello_fisso_superiore"],
  [/\bcon sopraluce/, "persiana:con_sopraluce"],
  [/\b2 ante asimmetriche \(principale (dx|sx)\)/, "persiana:2_ante_asimm_principale_$1"],
  [/\b3 ante \(2\+1/, "persiana:3_ante_2_1_sx"],
  [/\b3 ante \(1\+2/, "persiana:3_ante_1_2_dx"],
  [/\b4 ante \(2\+2\)/, "persiana:4_ante_2_2"],
  [/\b1 anta (dx|sx)\b/, "persiana:1_anta_$1"],
  [/\b1 anta\b/, "persiana:1_anta_dx"],
  [/\b([234]) ante\b/, "persiana:$1_ante"],
];

const SERRAMENTI: Regola[] = [
  [/\bporta finestra 2 ante con fisso laterale (sx|dx)/, "porta_finestra_2_ante_fisso_$1"],
  [/\bfinestra 2 ante con fisso laterale (sx|dx)/, "finestra_2_ante_fisso_$1"],
  [/\bfinestra con fisso centrale/, "finestra_fisso_centrale"],
  [/\bporta ?finestra (pvc )?4 ante/, "porta_finestra_4_ante"],
  [/\bfinestra (pvc )?4 ante/, "finestra_4_ante"],
  [/\bfinestra (ad arco|arco) ribassato/, "finestra_arco_ribassato"],
  [/\balzante scorrevole a scomparsa/, "alzante_scomparsa"],
  [/\balzante scorrevole fa \+ as \+ as \+ fa/, "alzante_fa_as_as_fa"],
  [/\balzante scorrevole as \+ fa/, "alzante_as_fa"],
  [/\btraslante scorrevole con fisso nel telaio/, "traslante_fisso_telaio"],
  [/\btraslante scorrevole con fisso nell anta/, "traslante_fisso_anta"],
  [/\btraslante scorrevole su parete/, "traslante_su_parete"],
  [/\btraslante scorrevole 4 ante/, "traslante_4_ante"],
  [/\bscorri ribalta patio/, "scorri_ribalta_patio"],
  [/\bsmart slide/, "smart_slide"],
  [/\bslide plus/, "slide_plus"],
  [/^slide$/, "slide"],
  [/\bporta ?finestra scorrevole 2 ante/, "porta_finestra_scorrevole_2_ante"],
  [/\bfinestra scorrevole 2 ante/, "finestra_scorrevole_2_ante"],
  [/\bporta finestra a libro 3 ante/, "porta_finestra_libro_3_ante"],
  [/\bporta finestra a libro 4 ante/, "porta_finestra_libro_4_ante"],
  [/\bporta finestra 2 ante con sopraluce/, "porta_finestra_2_ante_sopraluce"],
  [/\bporta ?finestra (pvc )?1 anta/, "porta_finestra_1_anta"],
  [/\bporta ?finestra (pvc )?2 ante/, "porta_finestra_2_ante"],
  [/\bporta ?finestra (pvc )?3 ante/, "porta_finestra_3_ante"],
  [/\bportoncino 1 anta/, "portoncino_1_anta"],
  [/\bportoncino 2 ante/, "portoncino_2_ante"],
  [/\bporta d ingresso a 2 ante/, "portoncino_2_ante"],
  [/\bporta balcone 1 anta/, "porta_finestra_1_anta"],
  [/\bfinestra 1 anta con sopraluce/, "finestra_1_anta_sopraluce"],
  [/\bfinestra 1 anta con sottoluce/, "finestra_1_anta_sottoluce"],
  [/\bfinestra 2 ante con sopraluce a due sezioni/, "finestra_2_ante_sopraluce_2_sezioni"],
  [/\bfinestra 2 ante con sopraluce/, "finestra_2_ante_sopraluce"],
  [/\bfinestra 2 ante con sottoluce/, "finestra_2_ante_sottoluce"],
  [/\bfinestra 3 ante con sopraluce/, "finestra_3_ante_sopraluce"],
  [/\bfinestra (ad arco|arco)\b/, "finestra_arco"],
  [/\bfinestra trapezoidale/, "finestra_trapezio"],
  [/\bfinestra (a )?lunetta/, "finestra_lunetta"],
  [/\bfinestra tonda/, "finestra_tonda"],
  [/\bfinestra triangolare/, "finestra_triangolo"],
  [/\bfinestra ogivale/, "finestra_ogiva"],
  [/\bfinestra (a )?wasistas/, "finestra_wasistas"],
  [/\bfisso nel telaio/, "fisso"],
  [/\bfisso nell anta/, "fisso_anta"],
  [/\bfinestra 1 anta/, "finestra_1_anta"],
  [/\bfinestra (pvc )?2 ante/, "finestra_2_ante"],
  [/\bfinestra 3 ante/, "finestra_3_ante"],
  [/\bmonoblocco 1 anta/, "monoblocco_1_anta"],
  [/\bmonoblocco 2 ante/, "monoblocco_2_ante"],
];

function applica(regole: Regola[], k: string): string | null {
  for (const [re, id] of regole) {
    const m = re.exec(k);
    if (m) return id.replace(/\$(\d)/g, (_, n) => m[Number(n)]);
  }
  return null;
}

/** Il tipo di disegno per il nome di un articolo, o null se non si riconosce (o se non va disegnato). */
export function tipologiaDaNome(nome: string): string | null {
  const k = chiave(nome);
  if (!k || ESCLUSI.test(k)) return null;
  // «Scuro 2 Ante»: una persiana a scuro pieno.
  if (/^scuro \d? ?ante?\b/.test(k)) {
    const m = /^scuro (\d) ante/.exec(k);
    return m ? `persiana:${m[1]}_ante:scuro` : null;
  }
  if (/^persiana\b|^scuro\b/.test(k)) return applica(PERSIANE, k);
  return applica(SERRAMENTI, k);
}
