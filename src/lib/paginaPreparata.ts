/**
 * La pagina preparata dal prerender resta sullo schermo finché quella di React
 * non è pronta.
 *
 * Le pagine del sito arrivano già disegnate (scripts/prerender.mjs), ma quel
 * disegno è una fotografia del browser a pagina finita: niente marcatori
 * `<!--$-->` dei Suspense, lo stato DOPO gli effetti (animazioni partite,
 * sezioni lazy già dentro) e una finestra da 1280 px. hydrateRoot non poteva
 * riusarlo: falliva SEMPRE (React #418 e #423), buttava via il DOM e ridisegnava
 * da zero — e mentre i pezzi lazy arrivavano, il Suspense delle rotte mostrava
 * il velo «Caricamento in corso…» sopra una pagina che un attimo prima era lì.
 *
 * Qui la pagina preparata esce da #root e resta visibile; React disegna la sua,
 * nascosta, sopra. Si scambiano quando:
 * - nella pagina di React c'è il `<footer>` (l'ultimo elemento di ogni pagina
 *   pubblica: se c'è, la pagina è finita);
 * - React ha portato altrove (un redirect, un utente già entrato) e non è sul
 *   velo di caricamento;
 * - sono passati `attesaMassimaMs` e React non è sul velo (una pagina senza
 *   footer, come la 404).
 * Mai sul velo, se non oltre `limiteAssolutoMs`: meglio il velo che una pagina
 * ferma per sempre.
 */
export function mettiDaParteLaPaginaPreparata(
  root: HTMLElement,
  opzioni: {
    attesaMassimaMs?: number;
    limiteAssolutoMs?: number;
    prossimoFrame?: (fn: () => void) => void;
    percorso?: () => string;
  } = {},
): { preparata: HTMLElement; scambia: () => void } {
  const attesaMassimaMs = opzioni.attesaMassimaMs ?? 8000;
  const limiteAssolutoMs = opzioni.limiteAssolutoMs ?? 30000;
  // Due frame: il primo fa calcolare lo stile alla pagina di React, il secondo
  // arriva quando è già dipinta — lo scambio non mostra mai un buco.
  const prossimoFrame =
    opzioni.prossimoFrame ?? ((fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn)));
  const percorso = opzioni.percorso ?? (() => window.location.pathname);
  const percorsoIniziale = percorso();
  const inizio = Date.now();

  const preparata = document.createElement("div");
  preparata.id = "pagina-preparata";
  while (root.firstChild) preparata.appendChild(root.firstChild);
  root.before(preparata);

  const stilePrecedente = root.getAttribute("style");
  // Nascosto ma disegnato davvero (niente display:none): layout,
  // IntersectionObserver e GSAP lavorano come sulla pagina vera.
  root.style.cssText =
    "position:absolute;top:0;left:0;right:0;visibility:hidden;opacity:0;pointer-events:none;";

  const sulVelo = () => !!root.querySelector("[data-caricamento-pagina]");
  const completa = () => !!root.querySelector("footer");
  const altrove = () => percorso() !== percorsoIniziale;

  let fatto = false;
  let timer = 0;

  function scambia() {
    if (fatto) return;
    fatto = true;
    osservatore.disconnect();
    window.clearTimeout(timer);
    preparata.remove();
    if (stilePrecedente === null) root.removeAttribute("style");
    else root.setAttribute("style", stilePrecedente);
  }

  const osservatore = new MutationObserver(() => {
    if (fatto) return;
    if (completa() || (altrove() && !sulVelo() && root.childElementCount > 0)) prossimoFrame(scambia);
  });

  function controllaAttesa() {
    if (fatto) return;
    const trascorso = Date.now() - inizio;
    if (trascorso >= limiteAssolutoMs || (!sulVelo() && root.childElementCount > 0)) {
      scambia();
      return;
    }
    timer = window.setTimeout(controllaAttesa, 1000);
  }

  osservatore.observe(root, { childList: true, subtree: true });
  timer = window.setTimeout(controllaAttesa, attesaMassimaMs);

  return { preparata, scambia };
}
