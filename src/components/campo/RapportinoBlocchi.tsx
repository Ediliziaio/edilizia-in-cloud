/**
 * Il rapportino letto a blocchi: una scheda per ogni fase su cui si è lavorato, con i suoi materiali e le sue
 * foto, poi quello che non è legato a nessuna fase. Le stesse schede del PDF (stesso raggruppamento: vedi
 * `bloccoFasi` in genera-pdf-rapportino/model.ts), per chi lo apre dall'ufficio e per chi lo ha compilato.
 *
 * `compatto` = una riga per fase (nome, avanzamento, quanti materiali e quante foto), senza elenchi: per le
 * liste da telefono.
 */
import { useMemo } from "react";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { cn } from "@/lib/utils";
import { bloccoFasi, oreBrevi, type FaseBlocco, type MaterialeBlocco } from "../../../supabase/functions/genera-pdf-rapportino/model";

interface Props {
  report: { fasi_lavorate?: unknown; materiali_usati?: unknown; foto_urls?: unknown };
  /** Apre una foto a tutto schermo; riceve l'indirizzo com'è salvato nel rapportino. */
  onFoto?: (url: string) => void;
  compatto?: boolean;
  className?: string;
  /**
   * phase_id → nome attuale della fase. Serve ai rapportini scritti prima che il nome entrasse nella voce
   * (hanno solo phase_id e ore): senza, la scheda si chiamerebbe «Lavorazione non identificata».
   */
  nomiFasi?: ReadonlyMap<string, string>;
}

const NESSUN_NOME: ReadonlyMap<string, string> = new Map();

const ETICHETTA = "text-xs font-semibold uppercase tracking-wide text-slate-500";

const conto = (n: number, singolare: string, plurale: string) => `${n} ${n === 1 ? singolare : plurale}`;

function RigaMateriale({ m }: { m: MaterialeBlocco }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 break-words text-slate-900">{m.nome}</span>
      <span className="shrink-0 text-right tabular-nums text-slate-700">
        <span className="font-semibold">{m.quantita}</span> {m.unita !== "-" ? m.unita : ""}
        <span className="block text-xs text-slate-500">{m.origine}</span>
      </span>
    </li>
  );
}

function GrigliaFoto({ foto, alt, onFoto }: { foto: string[]; alt: string; onFoto?: (url: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {foto.map((url, i) => (
        <button key={`${url}-${i}`} type="button" onClick={() => onFoto?.(url)} aria-label={`Apri ${alt} ${i + 1}`}
          className="overflow-hidden rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <ImgRiservata width={88} height={88} loading="lazy" src={url} alt={`${alt} ${i + 1}`}
            className="h-[88px] w-[88px] object-cover transition-opacity hover:opacity-80" />
        </button>
      ))}
    </div>
  );
}

function SchedaFase({ fase, compatto, onFoto }: { fase: FaseBlocco; compatto: boolean; onFoto?: (url: string) => void }) {
  const completata = fase.percentuale === 100;
  const stato = completata ? "Completata" : fase.percentuale !== null ? `${fase.percentuale.toLocaleString("it-IT")}%` : "Lavorata";
  const pill = (
    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
      completata ? "bg-emerald-100 text-emerald-800" : fase.percentuale !== null ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700")}>
      {stato}
    </span>
  );
  if (compatto) {
    const dettagli = [
      fase.materiali.length ? conto(fase.materiali.length, "materiale", "materiali") : "",
      fase.foto.length ? conto(fase.foto.length, "foto", "foto") : "",
    ].filter(Boolean).join(" · ");
    return (
      <li className="flex items-center justify-between gap-2 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{fase.nome}</p>
          {dettagli && <p className="text-xs text-muted-foreground">{dettagli}</p>}
        </div>
        {pill}
      </li>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <header className="border-b bg-orange-50/70 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="min-w-0 break-words text-sm font-semibold text-slate-900">{fase.nome}</h4>
          {pill}
        </div>
        {fase.percentuale !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`Avanzamento ${fase.percentuale}%`}>
            <div className={cn("h-full rounded-full", completata ? "bg-emerald-600" : "bg-orange-500")} style={{ width: `${Math.min(100, fase.percentuale)}%` }} />
          </div>
        )}
        {fase.ore !== null && <p className="mt-1.5 text-xs text-slate-600">{oreBrevi(fase.ore)} dichiarate su questa lavorazione</p>}
      </header>
      {fase.materiali.length > 0 && (
        <div>
          <p className={cn(ETICHETTA, "px-3 pt-2")}>Materiali usati</p>
          <ul className="divide-y">{fase.materiali.map((m, i) => <RigaMateriale key={i} m={m} />)}</ul>
        </div>
      )}
      {fase.foto.length > 0 && (
        <div className="px-3 pb-3 pt-2">
          <p className={cn(ETICHETTA, "mb-1.5")}>Foto della lavorazione ({fase.foto.length})</p>
          <GrigliaFoto foto={fase.foto} alt={`Foto di ${fase.nome}`} onFoto={onFoto} />
        </div>
      )}
      {fase.materiali.length === 0 && fase.foto.length === 0 && (
        <p className="px-3 py-2 text-xs text-slate-500">Nessun materiale né foto legati a questa lavorazione.</p>
      )}
    </section>
  );
}

export function RapportinoBlocchi({ report, onFoto, compatto = false, className, nomiFasi = NESSUN_NOME }: Props) {
  const b = useMemo(
    () => bloccoFasi({ fasi_lavorate: report.fasi_lavorate, materiali_usati: report.materiali_usati, foto_urls: report.foto_urls }, nomiFasi),
    [report.fasi_lavorate, report.materiali_usati, report.foto_urls, nomiFasi],
  );
  const conFasi = b.fasi.length > 0;
  if (compatto) {
    // Da telefono, nella lista: una riga per fase e i totali di quello che non è legato a nessuna.
    const altro = [
      b.altriMateriali.length ? conto(b.altriMateriali.length, "materiale generale", "materiali generali") : "",
      b.altreFoto.length ? conto(b.altreFoto.length, conFasi ? "altra foto" : "foto", conFasi ? "altre foto" : "foto") : "",
    ].filter(Boolean).join(" · ");
    if (!conFasi) return null;
    return (
      <div className={className}>
        <ul className="divide-y">{b.fasi.map(f => <SchedaFase key={f.id} fase={f} compatto onFoto={onFoto} />)}</ul>
        {altro && <p className="pt-1.5 text-xs text-muted-foreground">Inoltre: {altro}</p>}
      </div>
    );
  }
  if (!conFasi && !b.altriMateriali.length && !b.altreFoto.length) return null;
  return (
    <div className={cn("space-y-4", className)}>
      {conFasi && (
        <div>
          <p className={ETICHETTA}>{b.fasi.length === 1 ? "Lavorazione" : "Lavorazioni"}</p>
          <div className="mt-1.5 space-y-2.5">
            {b.fasi.map(f => <SchedaFase key={f.id} fase={f} compatto={false} onFoto={onFoto} />)}
          </div>
        </div>
      )}
      {b.altriMateriali.length > 0 && (
        <div>
          <p className={ETICHETTA}>{conFasi ? "Altri materiali" : "Materiali usati"} ({b.altriMateriali.length})</p>
          <ul className="mt-1.5 divide-y overflow-hidden rounded-xl border bg-white">
            {b.altriMateriali.map((m, i) => <RigaMateriale key={i} m={m} />)}
          </ul>
        </div>
      )}
      {b.altreFoto.length > 0 && (
        <div>
          <p className={ETICHETTA}>{b.fasi.some(f => f.foto.length) ? "Altre foto del cantiere" : "Foto"} ({b.altreFoto.length})</p>
          <div className="mt-1.5"><GrigliaFoto foto={b.altreFoto} alt="Foto" onFoto={onFoto} /></div>
        </div>
      )}
    </div>
  );
}
