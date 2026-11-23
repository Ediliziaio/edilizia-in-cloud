import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Posizione di scorrimento tra una pagina e l'altra.
 *
 * Due contenitori scorrono: la finestra (da computer e nelle pagine pubbliche) e
 * `#main-content` (nell'area azienda da telefono, dove il guscio è alto quanto lo
 * schermo e scorre solo il contenuto). Prima si riportava in cima soltanto la
 * finestra, a ogni cambio di pagina, anche tornando indietro: chi apriva la
 * ventesima fattura di un elenco e tornava ai risultati ripartiva dall'inizio
 * (collaudo mobile, 23/11/2026).
 *
 * - Pagina nuova (link, navigate): entrambi in cima.
 * - Indietro/avanti del browser o del telefono: si ripristina la posizione che
 *   quella voce di cronologia aveva, riprovando finché la pagina non è di nuovo
 *   abbastanza lunga (i dati arrivano dopo il primo disegno). Se nel frattempo
 *   la persona scorre o tocca, si smette: decide lei.
 * - Primo montaggio: la posizione la decide il browser (un link con #ancora, il
 *   ritorno indietro), e chi ha già scorso la pagina del prerender resta dov'è.
 */

type Posizione = { finestra: number; contenuto: number };

const CHIAVE_ARCHIVIO = "eic:scorrimento";
const MAX_VOCI = 60;
// Dopo un ricaricamento i dati dell'elenco ripartono da zero: su rete mobile
// arrivano anche dopo qualche secondo. Un tocco o uno scorrimento fermano prima.
const ATTESA_MASSIMA_MS = 8000;

function contenuto(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.getElementById("main-content");
}

function leggiArchivio(): Record<string, Posizione> {
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_ARCHIVIO);
    return grezzo ? (JSON.parse(grezzo) as Record<string, Posizione>) : {};
  } catch {
    return {};
  }
}

function scriviArchivio(archivio: Record<string, Posizione>) {
  try {
    const chiavi = Object.keys(archivio);
    if (chiavi.length > MAX_VOCI) {
      for (const chiave of chiavi.slice(0, chiavi.length - MAX_VOCI)) delete archivio[chiave];
    }
    sessionStorage.setItem(CHIAVE_ARCHIVIO, JSON.stringify(archivio));
  } catch {
    /* archivio non disponibile (navigazione privata): si perde solo il ripristino */
  }
}

function posizioneAttuale(): Posizione {
  return { finestra: window.scrollY, contenuto: contenuto()?.scrollTop ?? 0 };
}

export default function ScrollToTop(): null {
  const location = useLocation();
  const tipo = useNavigationType();
  const primoMontaggio = useRef(true);
  const chiaveCorrente = useRef(location.key);
  const percorsoCorrente = useRef(location.pathname);
  const archivio = useRef<Record<string, Posizione> | null>(null);
  // Il ripristino in corso vive fuori dall'effetto: una riscrittura dei soli
  // parametri («?cerca=» che la pagina rimette a posto da sé) cambia la voce di
  // cronologia ma non deve interromperlo. Lo ferma solo un'altra pagina, un
  // tocco, uno scorrimento o il tempo massimo.
  const ripristino = useRef<{ ferma: () => void } | null>(null);

  // Ricorda la posizione della voce corrente mentre si scorre (una volta per fotogramma).
  useEffect(() => {
    let fotogramma = 0;
    const annota = () => {
      if (fotogramma) return;
      fotogramma = requestAnimationFrame(() => {
        fotogramma = 0;
        // Mentre si ripristina la pagina è ancora corta: annotare ora salverebbe 0.
        if (ripristino.current) return;
        archivio.current ??= leggiArchivio();
        archivio.current[chiaveCorrente.current] = posizioneAttuale();
        scriviArchivio(archivio.current);
      });
    };
    // In cattura: `#main-content` può nascere dopo (il guscio si monta col primo accesso).
    document.addEventListener("scroll", annota, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", annota, { capture: true });
      if (fotogramma) cancelAnimationFrame(fotogramma);
    };
  }, []);

  useEffect(() => () => ripristino.current?.ferma(), []);

  useLayoutEffect(() => {
    const percorsoPrima = percorsoCorrente.current;
    const chiavePrima = chiaveCorrente.current;
    chiaveCorrente.current = location.key;
    percorsoCorrente.current = location.pathname;
    if (primoMontaggio.current) {
      primoMontaggio.current = false;
      return;
    }

    archivio.current ??= leggiArchivio();
    if (tipo !== "POP" && percorsoPrima === location.pathname) {
      // Un filtro o una ricerca che riscrive solo «?…» resta dov'è, e la voce
      // nuova eredita la posizione di quella che sostituisce.
      const ereditata = archivio.current[chiavePrima];
      if (ereditata) {
        archivio.current[location.key] = ereditata;
        scriviArchivio(archivio.current);
      }
      return;
    }

    ripristino.current?.ferma();
    ripristino.current = null;
    const meta = tipo === "POP" ? archivio.current[location.key] : undefined;
    if (!meta) {
      window.scrollTo(0, 0);
      const main = contenuto();
      if (main) main.scrollTop = 0;
      return;
    }

    let fermato = false;
    let fotogramma = 0;
    const inizio = performance.now();
    const ferma = () => {
      fermato = true;
      if (fotogramma) cancelAnimationFrame(fotogramma);
      window.removeEventListener("wheel", ferma);
      window.removeEventListener("touchstart", ferma);
      window.removeEventListener("keydown", ferma);
      if (ripristino.current?.ferma === ferma) ripristino.current = null;
    };
    window.addEventListener("wheel", ferma, { passive: true });
    window.addEventListener("touchstart", ferma, { passive: true });
    window.addEventListener("keydown", ferma);
    ripristino.current = { ferma };

    const prova = () => {
      if (fermato) return;
      const main = contenuto();
      window.scrollTo(0, meta.finestra);
      if (main) main.scrollTop = meta.contenuto;
      const arrivato = Math.abs(window.scrollY - meta.finestra) <= 2
        && (!main || Math.abs(main.scrollTop - meta.contenuto) <= 2);
      if (arrivato || performance.now() - inizio >= ATTESA_MASSIMA_MS) {
        ferma();
        return;
      }
      fotogramma = requestAnimationFrame(prova);
    };
    prova();
    // Si reagisce al cambio di voce della cronologia, non solo di percorso:
    // ?cerca= e ?pagina= tornano indietro con la loro posizione.
  }, [location.key, location.pathname, tipo]);

  return null;
}
