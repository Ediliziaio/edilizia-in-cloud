/**
 * Il rimando a una pagina delle impostazioni da un posto dove si sta lavorando (un preventivo, una finestra di
 * invio, un editor di modello).
 *
 * Un `<a href>` semplice ricarica l'app: quello che non è ancora salvato sparisce. Di default si apre in una
 * nuova scheda, così il lavoro resta dov'è e chi torna lo ritrova; con `nuovaScheda={false}` è un `Link` di
 * react-router, che non ricarica niente (per le pagine già salvate, o che non hanno niente da perdere).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface LinkImpostazioneProps {
  /** L'indirizzo, con l'àncora o la scheda se serve: «/azienda/impostazioni/margini#prezzo». */
  to: string;
  children: ReactNode;
  className?: string;
  nuovaScheda?: boolean;
}

export function LinkImpostazione({ to, children, className, nuovaScheda = true }: LinkImpostazioneProps) {
  if (!nuovaScheda) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (si apre in una nuova scheda)</span>
    </a>
  );
}
