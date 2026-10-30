import { Link } from "react-router-dom";
import { Building2, ChevronRight, FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCruscottoGenerali } from "@/hooks/useCruscottoGenerali";
import { formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RigaAppalto, RigaOperazione, CruscottoGenerali } from "@/lib/orders/generali/cruscottoGenerali";

/**
 * Le commesse generali nel cruscotto: il portafoglio dei contratti (appalti) e
 * le operazioni immobiliari (sviluppo, compravendita), solo quelle in corso.
 * Compare solo alle aziende che le hanno accese. Ogni riga apre la sua generale.
 * I numeri sono quelli della pagina della generale (vedi cruscottoGenerali.ts).
 */
export function CommesseGeneraliCruscotto() {
  const { data, isLoading, error, attiva } = useCruscottoGenerali();
  if (!attiva) return null;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (error) {
    return <p role="alert" className="p-3 text-sm text-destructive">Commesse generali non disponibili. Riprova tra poco.</p>;
  }
  if (!data || (data.appalti.length === 0 && data.operazioni.length === 0)) return null;
  return (
    <div className="space-y-3">
      {data.appalti.length > 0 && <PortafoglioContratti dati={data} />}
      {data.operazioni.length > 0 && <OperazioniImmobiliari dati={data} />}
      {data.nonLette > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.nonLette === 1 ? "Una commessa generale non si è potuta leggere" : `${data.nonLette} commesse generali non si sono potute leggere`}: i suoi numeri mancano dai totali.
        </p>
      )}
    </div>
  );
}

/** Euro in breve; «—» quando il numero non c'è o non è visibile. */
const eur = (v: number | null) => (v === null ? "—" : formatCurrencyCompact(v));

function Numero({ label, valore, nota, tono }: { label: string; valore: string; nota?: string; tono?: "rosso" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums text-slate-900", tono === "rosso" && "text-red-600")}>{valore}</div>
      {nota && <div className="truncate text-[11px] text-muted-foreground">{nota}</div>}
    </div>
  );
}

const notaPiano = (conPiano: number, totale: number) =>
  conPiano === totale ? "dal piano economico" : conPiano === 0 ? "nessun piano impostato" : `${conPiano} su ${totale} con il piano`;

function PortafoglioContratti({ dati }: { dati: CruscottoGenerali }) {
  const t = dati.totaleAppalti;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          Portafoglio contratti · {t.appalti} {t.appalti === 1 ? "appalto in corso" : "appalti in corso"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Numero label="Valore aggiornato" valore={eur(t.valore)} nota="contratti con atti e varianti" />
          <Numero label="Eseguito" valore={eur(t.eseguito)} />
          <Numero label="Da eseguire" valore={eur(t.daEseguire)} />
          <Numero label="Fatturato" valore={eur(t.fatturato)} />
          <Numero label="Da incassare" valore={eur(t.daIncassare)} nota="sul fatturato" />
          {dati.permessi.margini && (
            <Numero label="Margine a finire" valore={eur(t.margineAFinire)} nota={notaPiano(t.conPiano, t.appalti)}
              tono={t.margineAFinire !== null && t.margineAFinire < 0 ? "rosso" : undefined} />
          )}
        </div>
        <Elenco
          righe={dati.appalti}
          margini={dati.permessi.margini}
          colonne={["Valore", "Eseguito", "Da eseguire", "Fatturato", "Da incassare"]}
          valori={(a: RigaAppalto) => [eur(a.valore), `${eur(a.eseguito)} · ${Math.round(a.avanzamento)}%`, eur(a.daEseguire), eur(a.fatturato), eur(a.daIncassare)]}
          sotto={(a: RigaAppalto) => a.cliente}
        />
      </CardContent>
    </Card>
  );
}

function OperazioniImmobiliari({ dati }: { dati: CruscottoGenerali }) {
  const t = dati.totaleOperazioni;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Operazioni immobiliari · {t.operazioni} in corso
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Numero label="Unità vendute" valore={`${t.vendute} su ${t.unita}`} nota={`${t.libere} ${t.libere === 1 ? "libera" : "libere"}`} />
          <Numero label="Venduto" valore={eur(t.venduto)} nota="compromessi e rogiti" />
          <Numero label="Incassato" valore={eur(t.incassato)} nota="caparre, acconti, saldi" />
          {dati.permessi.margini && (
            <>
              <Numero label="Capitale impegnato" valore={eur(t.capitaleImpegnato)} nota="costi meno incassi, oggi" />
              <Numero label="Margine a finire" valore={eur(t.margineAFinire)} nota={notaPiano(t.conPiano, t.operazioni)}
                tono={t.margineAFinire !== null && t.margineAFinire < 0 ? "rosso" : undefined} />
            </>
          )}
        </div>
        <Elenco
          righe={dati.operazioni}
          margini={dati.permessi.margini}
          colonne={["Unità vendute", "Venduto", "Incassato", ...(dati.permessi.margini ? ["Capitale impegnato"] : [])]}
          valori={(o: RigaOperazione) => [
            `${o.vendute} su ${o.unita}`, eur(o.venduto), eur(o.incassato),
            ...(dati.permessi.margini ? [eur(o.capitaleImpegnato)] : []),
          ]}
          sotto={(o: RigaOperazione) => (o.modello === "sviluppo" ? "Sviluppo immobiliare" : "Compra, ristruttura, vendi")}
        />
      </CardContent>
    </Card>
  );
}

interface RigaBase { id: string; codice: string | null; nome: string; margineAFinire: number | null; piano: boolean }

/** Una riga per generale: tabella da scrivania, elenco sul telefono. La riga apre la generale. */
function Elenco<T extends RigaBase>({ righe, colonne, valori, sotto, margini }: {
  righe: T[];
  colonne: string[];
  valori: (r: T) => string[];
  sotto: (r: T) => string | null;
  margini: boolean;
}) {
  const margine = (r: T) => (r.piano ? eur(r.margineAFinire) : "senza piano");
  return (
    <>
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-1.5 pr-2 font-semibold">Commessa generale</th>
              {colonne.map((c) => <th key={c} className="px-2 py-1.5 text-right font-semibold">{c}</th>)}
              {margini && <th className="px-2 py-1.5 text-right font-semibold">Margine a finire</th>}
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="py-1.5 pr-2">
                  <Link to={`/azienda/ordini/${r.id}`} className="block min-w-0 hover:underline">
                    <span className="font-medium text-slate-900">{r.codice ? `${r.codice} · ` : ""}{r.nome}</span>
                    {sotto(r) && <span className="block truncate text-xs text-muted-foreground">{sotto(r)}</span>}
                  </Link>
                </td>
                {valori(r).map((v, i) => <td key={colonne[i]} className="px-2 py-1.5 text-right tabular-nums">{v}</td>)}
                {margini && (
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", !r.piano && "text-xs text-muted-foreground",
                    r.margineAFinire !== null && r.margineAFinire < 0 && "text-red-600")}>{margine(r)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y rounded-lg border sm:hidden">
        {righe.map((r) => (
          <li key={r.id}>
            <Link to={`/azienda/ordini/${r.id}`} className="flex items-center gap-2 px-3 py-2 active:bg-muted/60">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.codice ? `${r.codice} · ` : ""}{r.nome}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {colonne.map((c, i) => `${c} ${valori(r)[i]}`).join(" · ")}
                  {margini ? ` · Margine a finire ${margine(r)}` : ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
