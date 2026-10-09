/**
 * Pezzi per le pagine di impostazioni lunghe: una sezione per argomento, con il titolo, a quali preventivi
 * si applica e righe «cosa fa + interruttore». Servono a non avere una pila di riquadri tutti uguali, in cui
 * la funzione importante (il prezzo scritto a mano, la numerazione, cosa mostra il PDF) si perde.
 *
 * L'indice in cima porta alla sezione e lo stesso indirizzo (`…/margini#prezzo`) la apre già scorsa e
 * evidenziata: lo usano la ricerca delle impostazioni e i rimandi dagli altri schermi (vedi useVaiASezione).
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** «Tutti i preventivatori», «Preventivo generico»: a quali preventivi vale quello che c'è sotto. */
export function AmbitoImpostazione({ children }: { children: ReactNode }) {
  return (
    <Badge variant="secondary" className="whitespace-nowrap px-2 py-0 text-[11px] font-normal">
      {children}
    </Badge>
  );
}

export function SezioneImpostazione({
  id,
  titolo,
  descrizione,
  ambito,
  azione,
  evidenziata = false,
  children,
}: {
  /** Àncora: indice in cima, link dall'esterno. */
  id: string;
  titolo: string;
  descrizione?: ReactNode;
  ambito?: ReactNode;
  /** Piccola nota o bottone a destra del titolo («Si salva subito»). */
  azione?: ReactNode;
  evidenziata?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titolo`}
      data-evidenziata={evidenziata ? "true" : undefined}
      className={cn("scroll-mt-28 rounded-lg border bg-card transition-shadow duration-500", evidenziata && "ring-2 ring-primary/50")}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id={`${id}-titolo`} className="text-base font-semibold leading-tight">
            {titolo}
          </h2>
          {descrizione && <p className="mt-0.5 text-sm text-muted-foreground">{descrizione}</p>}
        </div>
        {(ambito || azione) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {ambito}
            {azione}
          </div>
        )}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  );
}

/** Una riga con testo a sinistra e il comando a destra. */
export function RigaImpostazione({
  titolo,
  descrizione,
  htmlFor,
  ambito,
  comando,
  children,
}: {
  titolo: ReactNode;
  descrizione?: ReactNode;
  /** id del comando, perché l'etichetta lo nomini per chi usa il lettore di schermo. */
  htmlFor?: string;
  ambito?: ReactNode;
  comando?: ReactNode;
  /** Sotto il testo: dettagli, note, un elenco. */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Label htmlFor={htmlFor} className="text-sm font-medium leading-snug">
            {titolo}
          </Label>
          {ambito}
        </div>
        {descrizione && (
          <p id={htmlFor ? `${htmlFor}-descrizione` : undefined} className="mt-0.5 text-xs text-muted-foreground">
            {descrizione}
          </p>
        )}
        {children}
      </div>
      {comando && <div className="shrink-0 pt-0.5">{comando}</div>}
    </div>
  );
}

export function RigaInterruttore({
  id,
  titolo,
  descrizione,
  checked,
  onCheckedChange,
  disabled,
  ambito,
  children,
}: {
  id: string;
  titolo: ReactNode;
  descrizione?: ReactNode;
  checked: boolean;
  onCheckedChange: (valore: boolean) => void;
  disabled?: boolean;
  ambito?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <RigaImpostazione
      titolo={titolo}
      descrizione={descrizione}
      htmlFor={id}
      ambito={ambito}
      comando={
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-describedby={descrizione ? `${id}-descrizione` : undefined}
        />
      }
    >
      {children}
    </RigaImpostazione>
  );
}

export interface VoceIndice {
  id: string;
  etichetta: string;
}

export function IndiceSezioni({ voci, onVai }: { voci: VoceIndice[]; onVai: (id: string) => void }) {
  return (
    <nav aria-label="Vai a una sezione" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none]">
      {voci.map((voce) => (
        <a
          key={voce.id}
          href={`#${voce.id}`}
          onClick={(evento) => {
            evento.preventDefault();
            onVai(voce.id);
          }}
          className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {voce.etichetta}
        </a>
      ))}
    </nav>
  );
}
