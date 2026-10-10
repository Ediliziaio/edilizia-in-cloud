/**
 * Pezzi per le pagine di impostazioni lunghe: una sezione per argomento, con il titolo, a quali preventivi
 * si applica e righe «cosa fa + interruttore». Servono a non avere una pila di riquadri tutti uguali, in cui
 * la funzione importante (il prezzo scritto a mano, la numerazione, cosa mostra il PDF) si perde.
 *
 * L'indice in cima porta alla sezione e lo stesso indirizzo (`…/margini#prezzo`) la apre già scorsa e
 * evidenziata: lo usano la ricerca delle impostazioni e i rimandi dagli altri schermi (vedi useVaiASezione).
 */
import { type ReactNode, useEffect, useState } from "react";
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
  const attiva = useSezioneAttiva(voci);

  if (voci.length < 2) return null;

  return (
    <nav
      aria-label="Vai a una sezione"
      className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {voci.map((voce) => {
        const corrente = voce.id === attiva;
        return (
          <a
            key={voce.id}
            href={`#${voce.id}`}
            data-voce={voce.id}
            aria-current={corrente ? "true" : undefined}
            onClick={(evento) => {
              evento.preventDefault();
              onVai(voce.id);
            }}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              corrente ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {voce.etichetta}
          </a>
        );
      })}
    </nav>
  );
}

/** Segue lo scorrimento e dice quale sezione è in vista, così la sua voce nell'indice si evidenzia. */
function useSezioneAttiva(voci: VoceIndice[]): string {
  const [attiva, setAttiva] = useState(voci[0]?.id ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elementi = voci.map((v) => document.getElementById(v.id)).filter((e): e is HTMLElement => e !== null);
    if (elementi.length === 0) return;
    const inVista = new Set<string>();
    const osservatore = new IntersectionObserver(
      (entrate) => {
        for (const e of entrate) {
          if (e.isIntersecting) inVista.add(e.target.id);
          else inVista.delete(e.target.id);
        }
        // la prima sezione dell'elenco che è in vista
        const prima = voci.find((v) => inVista.has(v.id));
        if (prima) setAttiva(prima.id);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );
    elementi.forEach((e) => osservatore.observe(e));
    return () => osservatore.disconnect();
  }, [voci]);
  return attiva;
}
