/**
 * «Oggi» in cima all'app di cantiere (26/09/2026): dove vai, cosa fai, con chi
 * e chi chiamare. Le date sono le TUE (seguono le fasi e la squadra), non
 * quelle di tutta la commessa. Sotto, il prossimo giorno di lavoro.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { AlertCircle, ChevronRight, FilePenLine, Navigation, Package, Phone, Receipt, Users } from "lucide-react";
import { ScattaFoto } from "@/components/campo/ScattaFoto";
import { Skeleton } from "@/components/ui/skeleton";
import { UniformSelect } from "@/components/ui/uniform-select";
import { cn } from "@/lib/utils";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import {
  linkMappa, linkTelefono, useMiaGiornata,
  type CantiereDelGiorno, type Contatto,
} from "@/hooks/campo/useCampoGiornata";

const giornoLungo = (g: string) => format(parseISO(g), "EEEE d MMMM", { locale: dateFnsCampo() });

function Chiama({ ruolo, contatto }: { ruolo: string; contatto: Contatto }) {
  const t = useT();
  const tel = linkTelefono(contatto.telefono);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">{t(ruolo)}: </span>
        <span className="font-semibold">{contatto.nome}</span>
      </p>
      {tel && (
        <a
          href={tel}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border bg-background px-3 text-[13px] font-semibold text-foreground active:bg-muted"
          aria-label={t("Chiama {nome}", { nome: contatto.nome })}
        >
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />{t("Chiama")}
        </a>
      )}
    </div>
  );
}

/*
 * Collaudo 23/11/2026 («più semplice e minimale»): prima 6–7 pulsanti in tre righe (Rapportino, Bolla, Prelievo,
 * Portami lì pieno, Apri il cantiere, Foto, Segnala) e il nome del cantiere ripetuto sotto la tendina.
 * Ora: il nome (o l'indirizzo) apre il cantiere; due azioni grandi, Rapportino e Portami lì, a contorno perché il
 * pulsante pieno della Home è la timbratura; le occasionali in una riga piccola.
 */
function SchedaCantiere({ c, giorno, puoPrelevare, nomeNellaTendina }: {
  c: CantiereDelGiorno; giorno: string; puoPrelevare: boolean; nomeNellaTendina: boolean;
}) {
  const t = useT();
  const mappa = linkMappa(c.indirizzo);
  const vedeSquadra = c.sono_capocantiere || !!c.squadra?.sono_caposquadra;
  const piccola = "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border bg-background px-1 text-[13px] font-semibold active:bg-muted";
  return (
    <div className="space-y-3 rounded-2xl border bg-background p-3">
      <Link to={`/campo/lavoro/${c.order_id}`} aria-label={t("Apri il cantiere {nome}", { nome: c.titolo || c.codice || "" }).trim()}
        className="-m-1 flex min-h-11 items-center gap-2 rounded-xl p-1 active:bg-muted">
        <span className="min-w-0 flex-1">
          {!nomeNellaTendina && <span className="block text-[15px] font-bold leading-tight">{c.titolo || c.codice || t("Cantiere")}</span>}
          {c.indirizzo && <span className="mt-0.5 block text-sm text-muted-foreground">{c.indirizzo}</span>}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      <div className={cn("grid gap-2", mappa ? "grid-cols-2" : "grid-cols-1")} aria-label={t("Azioni per il cantiere")}>
        <Link to={`/campo/lavoro/${c.order_id}/rapportino?data=${giorno}`}
          className="flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-2 text-sm font-semibold text-primary">
          <FilePenLine className="size-4 shrink-0" aria-hidden="true" />{t("Rapportino")}
        </Link>
        {mappa && (
          <a href={mappa} target="_blank" rel="noopener noreferrer"
            className="flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border bg-background px-2 text-sm font-semibold active:bg-muted">
            <Navigation className="size-4 shrink-0" aria-hidden="true" />{t("Portami lì")}
          </a>
        )}
      </div>
      <div className={cn("grid gap-2", puoPrelevare ? "grid-cols-4" : "grid-cols-3")}>
        <ScattaFoto orderId={c.order_id} nomeCantiere={c.codice ?? c.titolo ?? undefined} className={piccola} />
        <Link to={`/campo/ddt?order=${c.order_id}`} className={piccola}>
          <Receipt className="hidden size-4 shrink-0 min-[370px]:block" aria-hidden="true" />{t("Bolla")}
        </Link>
        <Link to={`/campo/ticket/nuovo/${c.order_id}`} className={piccola}>
          <AlertCircle className="hidden size-4 shrink-0 min-[370px]:block" aria-hidden="true" />{t("Segnala")}
        </Link>
        {puoPrelevare && <Link to={`/campo/magazzino?order_id=${c.order_id}`} className={piccola}>
          <Package className="hidden size-4 shrink-0 min-[370px]:block" aria-hidden="true" />{t("Prelievo")}
        </Link>}
      </div>

      {(c.fasi.length > 0 || c.squadra) && (
        <div className="space-y-1 text-sm">
          {c.fasi.length > 0 && (
            <p><span className="text-muted-foreground">{t("Fai:")} </span><span className="font-semibold">{c.fasi.join(", ")}</span></p>
          )}
          {c.squadra && (
            <p className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.squadra.colore ?? "#94a3b8" }} aria-hidden="true" />
              <span className="font-semibold">{c.squadra.nome}</span>
              {c.squadra.sono_caposquadra && <span className="text-muted-foreground">· {t("sei il caposquadra")}</span>}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {c.squadra?.caposquadra && <Chiama ruolo="Caposquadra" contatto={c.squadra.caposquadra} />}
        {c.sono_capocantiere
          ? <p className="text-sm font-semibold text-primary">{t("Il capocantiere sei tu")}</p>
          : c.capocantiere && <Chiama ruolo="Capocantiere" contatto={c.capocantiere} />}
      </div>

      {vedeSquadra && (
        <Link
          to={`/campo/squadra/${c.order_id}`}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-50 text-sm font-semibold text-orange-800 active:bg-orange-100"
        >
          <Users className="h-4 w-4" aria-hidden="true" />{t("Chi c'è oggi")}
        </Link>
      )}
    </div>
  );
}

function CantieriOggi({ cantieri, giorno, memoria, puoPrelevare }: {
  cantieri: CantiereDelGiorno[];
  giorno: string;
  memoria?: string;
  puoPrelevare: boolean;
}) {
  const t = useT();
  const chiave = memoria ? `campo-cantiere-oggi:${memoria}` : null;
  const [scelta, setScelta] = useState(() => {
    try {
      const salvata = chiave ? localStorage.getItem(chiave) : null;
      return salvata?.startsWith(`${giorno}:`) ? salvata.slice(giorno.length + 1) : "";
    } catch { return ""; }
  });
  const cantiere = cantieri.find(c => c.order_id === scelta) ?? cantieri[0];

  return <>
    {cantieri.length > 1 && (
      <UniformSelect aria-label={t("Cantiere di oggi")} value={cantiere.order_id}
        onChange={event => {
          const id = event.target.value;
          setScelta(id);
          try { if (chiave) localStorage.setItem(chiave, `${giorno}:${id}`); } catch { /* La scelta rimane nella pagina. */ }
        }} className="min-h-11 w-full rounded-xl bg-background text-left">
        {cantieri.map(c => <option key={c.order_id} value={c.order_id}>
          {[c.codice, c.titolo || c.indirizzo].filter(Boolean).join(" · ") || "Cantiere"}
        </option>)}
      </UniformSelect>
    )}
    <SchedaCantiere key={cantiere.order_id} c={cantiere} giorno={giorno} puoPrelevare={puoPrelevare} nomeNellaTendina={cantieri.length > 1} />
  </>;
}

export function CampoOggi({ memoria, puoPrelevare = false }: { memoria?: string; puoPrelevare?: boolean } = {}) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMiaGiornata(14);

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (isError) {
    return (
      <section className="rounded-2xl border bg-background p-4 text-sm">
        {t("Non riesco a leggere dove lavori oggi.")}{" "}
        <button type="button" className="font-semibold text-primary underline" onClick={() => refetch()}>{t("Riprova")}</button>
      </section>
    );
  }

  const giorni = data?.giorni ?? [];
  const oggi = giorni[0];
  const prossimo = giorni.slice(1).find((g) => g.cantieri.length > 0);
  // Senza nessun cantiere con le date, il riquadro non serve: resta l'elenco dei cantieri.
  if (!oggi || (oggi.cantieri.length === 0 && !prossimo)) return null;

  return (
    <section aria-labelledby="campo-oggi" className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-3 shadow-sm md:p-4">
      {/* La data è già in cima alla Home: qui non si ripete. */}
      <h2 id="campo-oggi" className="text-base font-bold">{t("Oggi")}</h2>

      {oggi.cantieri.length === 0 ? (
        <p className="rounded-2xl border bg-background p-3 text-sm">{t("Oggi non hai cantieri in programma.")}</p>
      ) : (
        <CantieriOggi key={`${memoria ?? ""}:${oggi.giorno}`} cantieri={oggi.cantieri} giorno={oggi.giorno} memoria={memoria} puoPrelevare={puoPrelevare} />
      )}

      {prossimo && (
        <div className="rounded-2xl bg-background/70 px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {prossimo === giorni[1] ? t("Domani") : <span className="capitalize">{giornoLungo(prossimo.giorno)}</span>}
          </p>
          {prossimo.cantieri.map((c) => (
            <Link key={c.order_id} to={`/campo/lavoro/${c.order_id}`} className="mt-1 block">
              <span className="font-semibold">{c.titolo || c.codice || t("Cantiere")}</span>
              {c.fasi.length > 0 && <span className="text-muted-foreground"> · {c.fasi.join(", ")}</span>}
              {c.indirizzo && <span className="block truncate text-xs text-muted-foreground">{c.indirizzo}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
