import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  dataSalute, formattaPercentuale, latenzaSalute, ordineStatiJob, segnalazioniKey, statoJob, statiJob, tempoSalute,
  type FunzioneRiga, type JobRiga,
} from "./data";

const pagina = 20;

function ElencoSalute({ title, description, toolbar, children }: {
  title: string;
  description: string;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b p-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">{toolbar}</div>
      </div>
      {children}
    </section>
  );
}

function Cerca({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 grow basis-56">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input type="search" aria-label={label} placeholder={label + "…"} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 pl-9" />
    </div>
  );
}

function Filtro({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 max-w-full rounded-md border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </select>
  );
}

function RigaEspandibile({ label, detail, figures, children }: {
  label: ReactNode;
  detail?: ReactNode;
  figures?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group min-w-0">
      <summary className="grid min-w-0 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-4 text-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="break-words font-medium">{label}</p>
          {detail && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 break-words text-xs text-muted-foreground">{detail}</div>}
        </div>
        {figures && <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums md:col-span-1 md:row-start-1">{figures}</div>}
        <ChevronDown aria-hidden="true" className="col-start-2 row-start-1 h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 md:col-start-3" />
      </summary>
      <div className="mx-4 mb-4 rounded-lg border bg-muted/25 p-3 text-sm sm:mx-5">{children}</div>
    </details>
  );
}

function RigaStat({ label, children }: { label: string; children: ReactNode }) {
  return <span className="whitespace-nowrap text-muted-foreground">{label} <strong className="font-semibold text-foreground">{children}</strong></span>;
}

function Dettagli({ children }: { children: ReactNode }) {
  return <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

function Voce({ nome, children }: { nome: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-muted-foreground">{nome}</dt><dd className="mt-0.5 break-words font-medium">{children}</dd></div>;
}

function FineElenco({ mostrati, totale, onMore }: { mostrati: number; totale: number; onMore: () => void }) {
  if (totale === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/15 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
      <span role="status">{Math.min(mostrati, totale)} di {totale} risultati</span>
      {mostrati < totale && <Button type="button" variant="outline" size="sm" onClick={onMore}>Mostra altri</Button>}
    </div>
  );
}

function Vuoto({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">{children}</p>;
}

const tonoJob = {
  guasti: "destructive",
  rientrati: "outline",
  regolari: "secondary",
  "senza-esecuzioni": "outline",
  disattivati: "outline",
} as const;

export function JobPianificati({ job, jobFalliti, riferimento, filtroIniziale = "tutti" }: {
  job: JobRiga[];
  jobFalliti: JobRiga[];
  riferimento: string;
  filtroIniziale?: "tutti" | "guasti";
}) {
  const [ricerca, cerca] = useState("");
  const [filtro, filtra] = useState<string>(filtroIniziale);
  const [visibili, mostra] = useState(pagina);
  const termini = ricerca.trim().toLocaleLowerCase("it");
  const perJob = new Map(jobFalliti.map((entry) => [entry.job, entry]));
  const righe = job.map((entry) => {
    const storico = perJob.get(entry.job);
    return { entry, storico, stato: statoJob(entry, storico) };
  });
  const risultati = righe
    .filter(({ entry, stato }) => (filtro === "tutti" || stato === filtro) &&
      [entry.job, entry.schedule ?? ""].join(" ").toLocaleLowerCase("it").includes(termini))
    .sort((a, b) => ordineStatiJob[a.stato] - ordineStatiJob[b.stato] || b.entry.falliti - a.entry.falliti || a.entry.job.localeCompare(b.entry.job));

  return (
    <ElencoSalute
      title="Job pianificati"
      description="Esecuzioni nelle ultime 24 ore. Gli errori e i recuperi considerano anche le 24 ore precedenti."
      toolbar={<>
        <Cerca label="Cerca job o frequenza" value={ricerca} onChange={(value) => { cerca(value); mostra(pagina); }} />
        <Filtro label="Stato dei job" value={filtro} onChange={(value) => { filtra(value); mostra(pagina); }}>
          <option value="tutti">Tutti gli stati ({job.length})</option>
          {Object.entries(statiJob).map(([key, label]) => (
            <option key={key} value={key}>{label} ({righe.filter(({ stato }) => stato === key).length})</option>
          ))}
        </Filtro>
      </>}
    >
      {risultati.length ? (
        <div className="divide-y">
          {risultati.slice(0, visibili).map(({ entry, storico, stato }) => {
            const errore = entry.ultimo_errore ?? storico?.errore;
            return (
              <RigaEspandibile
                key={entry.job}
                label={<span className="font-mono text-[13px]">{entry.job}</span>}
                detail={<><Badge variant={tonoJob[stato]}>{statiJob[stato]}</Badge><span>{entry.ultima ? "Ultima esecuzione " + tempoSalute(entry.ultima, riferimento) : "Nessuna esecuzione in 24 h"}</span></>}
                figures={<><RigaStat label="Esecuzioni">{entry.esecuzioni}</RigaStat><RigaStat label="Errori">{entry.falliti}</RigaStat></>}
              >
                <Dettagli>
                  <Voce nome="Frequenza"><code className="break-all">{entry.schedule ?? "—"}</code></Voce>
                  <Voce nome="Ultima esecuzione">{dataSalute(entry.ultima ?? storico?.ultima)}</Voce>
                  {storico && <Voce nome="Errori nelle ultime 48 ore">{storico.falliti} su {storico.esecuzioni} esecuzioni</Voce>}
                </Dettagli>
                {errore && <p className="mt-3 whitespace-pre-wrap break-words border-t pt-2 text-xs">{errore}</p>}
              </RigaEspandibile>
            );
          })}
        </div>
      ) : <Vuoto>{job.length ? "Nessun job corrisponde ai filtri." : "Nessun job pianificato registrato."}</Vuoto>}
      <FineElenco mostrati={visibili} totale={risultati.length} onMore={() => mostra(visibili + pagina)} />
    </ElencoSalute>
  );
}

export function FunzioniMisurate({ funzioni }: { funzioni: FunzioneRiga[] }) {
  const [ricerca, cerca] = useState("");
  const [filtro, filtra] = useState("tutte");
  const [ordina, cambiaOrdine] = useState("errori");
  const [visibili, mostra] = useState(pagina);

  const risultati = funzioni
    .filter((entry) => (filtro !== "errori" || entry.errori > 0) && entry.funzione.toLocaleLowerCase("it").includes(ricerca.trim().toLocaleLowerCase("it")))
    .sort((a, b) => {
      if (ordina === "latenza") return (b.latenza_media_ms ?? -1) - (a.latenza_media_ms ?? -1);
      if (ordina === "chiamate") return b.chiamate - a.chiamate;
      return b.errori - a.errori || b.chiamate - a.chiamate;
    });
  return (
    <ElencoSalute
      title="Funzioni misurate"
      description="Chiamate, risposte HTTP con errore e latenza nelle ultime 24 ore."
      toolbar={<>
        <Cerca label="Cerca funzione" value={ricerca} onChange={(value) => { cerca(value); mostra(pagina); }} />
        <Filtro label="Esito funzioni" value={filtro} onChange={(value) => { filtra(value); mostra(pagina); }}>
          <option value="tutte">Tutte le funzioni</option>
          <option value="errori">Solo con errori</option>
        </Filtro>
        <Filtro label="Ordina funzioni" value={ordina} onChange={(value) => { cambiaOrdine(value); mostra(pagina); }}>
          <option value="errori">Più errori</option>
          <option value="latenza">Latenza media più alta</option>
          <option value="chiamate">Più chiamate</option>
        </Filtro>
      </>}
    >
      {risultati.length ? (
        <div className="divide-y">
          {risultati.slice(0, visibili).map((entry) => (
            <RigaEspandibile
              key={entry.funzione}
              label={<span className="font-mono text-[13px]">{entry.funzione}</span>}
              detail={entry.errori > 0 && <Badge variant="destructive">{entry.errori} {entry.errori === 1 ? "errore" : "errori"}</Badge>}
              figures={<><RigaStat label="Chiamate">{entry.chiamate}</RigaStat><RigaStat label="Latenza media">{latenzaSalute(entry.latenza_media_ms)}</RigaStat></>}
            >
              <Dettagli>
                <Voce nome="Ultima chiamata">{dataSalute(entry.ultima)}</Voce>
                <Voce nome="Picco di latenza">{latenzaSalute(entry.latenza_max_ms)}</Voce>
                <Voce nome="Percentuale di errori">{formattaPercentuale(entry.chiamate > 0 ? entry.errori / entry.chiamate * 100 : null)}</Voce>
              </Dettagli>
            </RigaEspandibile>
          ))}
        </div>
      ) : <Vuoto>{funzioni.length ? "Nessuna funzione corrisponde ai filtri." : "Nessuna chiamata misurata nelle ultime 24 ore."}</Vuoto>}
      <FineElenco mostrati={visibili} totale={risultati.length} onMore={() => mostra(visibili + pagina)} />
    </ElencoSalute>
  );
}

interface RigaErrore {
  origine: string;
  id: string;
  avvenuto_il: string;
  componente: string | null;
  messaggio: string | null;
  codice: number | null;
  azienda_nome: string | null;
  gravita: string;
  categoria: "azione_richiesta" | "errore_tecnico";
  numero_eventi: number;
  primo_evento: string;
}

export function ErroriRecenti() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: segnalazioniKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_errori_raggruppati" as never, { p_ore: 48, p_limit: 100 } as never);
      if (error) throw error;
      return (data ?? []) as unknown as RigaErrore[];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const [ricerca, cerca] = useState("");
  const [filtro, filtra] = useState("tutte");
  const [visibili, mostra] = useState(pagina);
  const segnalazioni = data ?? [];
  const termine = ricerca.trim().toLocaleLowerCase("it");
  const risultati = segnalazioni.filter((entry) =>
    (filtro === "tutte" || entry.categoria === filtro) && [
      entry.componente, entry.messaggio, entry.azienda_nome, entry.origine,
      entry.codice == null ? "" : "HTTP " + entry.codice,
    ].join(" ").toLocaleLowerCase("it").includes(termine),
  );

  return (
    <ElencoSalute
      title="Segnalazioni"
      description={segnalazioni.length === 100
        ? "I 100 gruppi di segnalazioni più recenti nelle ultime 48 ore."
        : "Eventi delle ultime 48 ore raggruppati per causa."}
      toolbar={<>
        <Cerca label="Cerca componente, azienda o codice" value={ricerca} onChange={(value) => { cerca(value); mostra(pagina); }} />
        <Filtro label="Tipo di segnalazione" value={filtro} onChange={(value) => { filtra(value); mostra(pagina); }}>
          <option value="tutte">Tutte le segnalazioni</option>
          <option value="errore_tecnico">Errori tecnici</option>
          <option value="azione_richiesta">Azioni richieste</option>
        </Filtro>
      </>}
    >
      {isLoading && <div role="status" aria-label="Caricamento segnalazioni" className="p-4"><Skeleton className="h-16 w-full" /></div>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b p-4 text-sm text-destructive">
        Non riesco a caricare le segnalazioni.
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button>
      </div>}
      {!isLoading && !error && risultati.length === 0 && (
        <Vuoto>{segnalazioni.length ? "Nessuna segnalazione corrisponde ai filtri." : "Nessun errore registrato nelle ultime 48 ore."}</Vuoto>
      )}
      {risultati.length > 0 && (
        <div className="divide-y">
          {risultati.slice(0, visibili).map((entry) => (
            <RigaEspandibile
              key={entry.origine + "-" + entry.id}
              label={<span className="line-clamp-2 whitespace-pre-wrap group-open:line-clamp-none">{entry.messaggio ?? entry.componente ?? "Segnalazione"}</span>}
              detail={<>
                <Badge variant={entry.categoria === "azione_richiesta" ? "outline" : "destructive"}>
                  {entry.categoria === "azione_richiesta" ? "Azione richiesta" : "Errore tecnico"}
                </Badge>
                {entry.componente && <span className="break-all font-mono">{entry.componente}</span>}
                {entry.azienda_nome && <span>{entry.azienda_nome}</span>}
              </>}
              figures={<>
                <RigaStat label="Eventi">{entry.numero_eventi}</RigaStat>
                {entry.codice != null && <span className="text-muted-foreground">HTTP {entry.codice}</span>}
              </>}
            >
              <Dettagli>
                <Voce nome="Origine">{entry.origine}</Voce>
                <Voce nome="Gravità">{entry.gravita}</Voce>
                <Voce nome="Primo evento">{dataSalute(entry.primo_evento)}</Voce>
                <Voce nome="Ultimo evento">{dataSalute(entry.avvenuto_il)}</Voce>
              </Dettagli>
            </RigaEspandibile>
          ))}
        </div>
      )}
      <FineElenco mostrati={visibili} totale={risultati.length} onMore={() => mostra(visibili + pagina)} />
    </ElencoSalute>
  );
}
