import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from "react";
import { LayoutGrid, Columns3, List, Search, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ContrattoCompleto } from "./ContrattiSubappalto";
import type { RiepilogoContratto } from "@/lib/subappaltatori/riconciliazioneContratto";
import { euroSub } from "@/lib/subappaltatori/lavoriMisure";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export const FASI_CONTRATTO = {
  bozza: "Bozza",
  attivo: "Attivo",
  sospeso: "Sospeso",
  completato: "Completato",
  risolto: "Risolto",
};
export type RigaContrattoSub = {
  contratto: ContrattoCompleto;
  riepilogo: RiepilogoContratto;
  firma: "firmato" | "in_attesa" | "da_firmare" | "non_disponibile";
};
const FIRME = {
  firmato: "Firma registrata",
  in_attesa: "In attesa di firma",
  da_firmare: "Da firmare",
  non_disponibile: "Firma non disponibile",
};
const data = (v: string | null) =>
  v ? v.slice(0, 10).split("-").reverse().join("/") : "Non indicata";

function Stato({ stato }: { stato: keyof typeof FASI_CONTRATTO }) {
  const t = useT();
  return (
    <Badge
      variant="outline"
      className={
        stato === "attivo"
          ? "border-green-200 bg-green-50 text-green-800"
          : stato === "sospeso"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : stato === "risolto"
              ? "border-red-200 bg-red-50 text-red-800"
              : "bg-muted/50"
      }
    >
      {t(FASI_CONTRATTO[stato])}
    </Badge>
  );
}

function Avanzamento({ r }: { r: RiepilogoContratto }) {
  return (
    <div className="min-w-24">
      <p className="mb-1 text-xs tabular-nums">
        {r.avanzamento}% · {euroSub(r.eseguito)}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${r.avanzamento}%` }}
        />
      </div>
    </div>
  );
}

function Scheda({
  riga,
  onApri,
}: {
  riga: RigaContrattoSub;
  onApri: (id: string) => void;
}) {
  const t = useT();
  const { contratto: c, riepilogo: r, firma } = riga;
  return (
    <button
      type="button"
      onClick={() => onApri(c.id)}
      className="w-full rounded-lg border bg-background p-3 text-left shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="break-words text-sm font-semibold">
          {c.numero_contratto || t("Contratto senza numero")}
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {c.commessa?.order_code || t("Commessa")} ·{" "}
        {c.commessa?.description || c.descrizione_lavori}
      </p>
      <div className="my-3 flex flex-wrap gap-2">
        <Stato stato={c.stato} />
        <Badge variant="outline">{t(FIRME[firma])}</Badge>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">{t("Valore con oneri")}</p>
          <p className="mt-1 font-semibold tabular-nums">{euroSub(r.valore)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t("Netto SAL non pagati")}</p>
          <p className="mt-1 font-semibold tabular-nums">
            {euroSub(r.daPagare)}
          </p>
        </div>
      </div>
      <Avanzamento r={r} />
      <p className="mt-3 text-xs text-muted-foreground">{t("Fine prevista: {data_fine_prevista}", { data_fine_prevista: String(data(c.data_fine_prevista) ?? "") })}</p>
      {r.avvisi.length > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-800">{t("{n} verifiche contabili", { n: r.avvisi.length })}</p>
      )}
    </button>
  );
}

/** Le viste condividono filtri e fonti; le fasi rappresentano lo stato lavori, distinto dalla firma. */
export function ElencoContrattiSub({
  righe,
  onApri,
  contesto = "contratti",
  onCommessa,
  onLavorazioni,
}: {
  righe: RigaContrattoSub[];
  onApri: (id: string) => void;
  contesto?: "contratti" | "commesse";
  onCommessa?: (id: string) => void;
  onLavorazioni?: (contratto: ContrattoCompleto) => void;
}) {
  const t = useT();
  const [vista, setVista] = useState<"tabella" | "fasi" | "schede">("tabella");
  const [ricerca, setRicerca] = useState("");
  const [fase, setFase] = useState("tutti");
  const [firma, setFirma] = useState("tutte");
  const [ordine, setOrdine] = useState("recenti");
  const [pagina, setPagina] = useState(0);
  const [limiti, setLimiti] = useState<Record<string, number>>({});
  const filtra = righe.filter(
    ({ contratto: c, firma: f }) =>
      (fase === "tutti" || c.stato === fase) &&
      (firma === "tutte" || f === firma) &&
      [
        c.numero_contratto,
        c.descrizione_lavori,
        c.commessa?.order_code,
        c.commessa?.description,
        c.commessa?.client_name,
        c.commessa?.client_company,
        c.referente_subappaltatore,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(ricerca.trim().toLowerCase()),
  );
  const filtrate = [...filtra].sort((a, b) =>
    ordine === "valore"
      ? b.riepilogo.valore - a.riepilogo.valore
      : ordine === "fine"
        ? (a.contratto.data_fine_prevista || "9999").localeCompare(
            b.contratto.data_fine_prevista || "9999",
          )
        : b.contratto.created_at.localeCompare(a.contratto.created_at),
  );
  const ultima = Math.max(0, Math.ceil(filtrate.length / 20) - 1);
  const corrente = Math.min(pagina, ultima);
  const visibili = filtrate.slice(corrente * 20, (corrente + 1) * 20);
  const totale = righe.reduce((a, r) => a + r.riepilogo.valore, 0);
  const cambia = (fn: () => void) => {
    fn();
    setPagina(0);
    setLimiti({});
  };
  const reset = () =>
    cambia(() => {
      setRicerca("");
      setFase("tutti");
      setFirma("tutte");
    });
  const azioneLavorazioni = (contratto: ContrattoCompleto) => onLavorazioni && (
    <Button size="sm" variant="outline" onClick={event => {
      event.stopPropagation();
      onLavorazioni(contratto);
    }}>{t("Lavorazioni affidate")}</Button>
  );
  const scheda = (r: RigaContrattoSub) => (
    <div key={r.contratto.id} className="space-y-1">
      <Scheda riga={r} onApri={onApri} />
      {azioneLavorazioni(r.contratto)}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Contratti", righe.length],
          [
            "Attivi",
            righe.filter((r) => r.contratto.stato === "attivo").length,
          ],
          [
            "Senza firma registrata",
            righe.filter(
              (r) => r.firma !== "firmato" && r.firma !== "non_disponibile",
            ).length,
          ],
          ["Valore con oneri", euroSub(totale)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-background p-3">
            <p className="text-xs text-muted-foreground">{t(String(label))}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border bg-background p-3">
        <div className="flex flex-wrap gap-2">
          <div
            className="flex rounded-lg bg-muted p-1"
            role="group"
            aria-label={t("Vista contratti")}
          >
            {(
              [
                ["tabella", "Tabella", List],
                ["fasi", "Fasi", Columns3],
                ["schede", "Schede", LayoutGrid],
              ] as const
            ).map(([v, label, Icon]) => (
              <Button
                key={v}
                size="sm"
                variant={vista === v ? "secondary" : "ghost"}
                aria-pressed={vista === v}
                onClick={() => setVista(v)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t("Cerca contratti e commesse")}
              placeholder={t("Cerca contratto, commessa, cliente o referente…")}
              className="pl-9"
              value={ricerca}
              onChange={(e) => cambia(() => setRicerca(e.target.value))}
            />
          </div>
          <UniformSelect
            aria-label={t("Stato firma")}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={firma}
            onChange={(e) => cambia(() => setFirma(e.target.value))}
          >
            <option value="tutte">{t("Tutte le firme")}</option>
            {Object.entries(FIRME).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </UniformSelect>
          <UniformSelect
            aria-label={t("Ordina contratti")}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={ordine}
            onChange={(e) => cambia(() => setOrdine(e.target.value))}
          >
            <option value="recenti">{t("Più recenti")}</option>
            <option value="valore">{t("Valore maggiore")}</option>
            <option value="fine">{t("Fine prevista")}</option>
          </UniformSelect>
        </div>
        <div
          className="flex flex-wrap items-center gap-1 border-t pt-2"
          role="group"
          aria-label={t("Stato lavori")}
        >
          {[["tutti", "Tutti"], ...Object.entries(FASI_CONTRATTO)].map(
            ([v, l]) => (
              <Button
                key={v}
                size="sm"
                variant={fase === v ? "secondary" : "ghost"}
                aria-pressed={fase === v}
                onClick={() => cambia(() => setFase(v))}
              >
                {l}
                <span className="ml-2 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                  {v === "tutti"
                    ? righe.length
                    : righe.filter((r) => r.contratto.stato === v).length}
                </span>
              </Button>
            ),
          )}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {t("{n} di {totale} contratti ·", { n: filtrate.length, totale: righe.length })}{" "}
          {contesto === "commesse"
            ? t("apri la commessa o il relativo contratto")
            : t("seleziona un contratto per i dettagli")}
        </p>
        <p>{t("Stato lavori e firma sono distinti")}</p>
      </div>
      {filtrate.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("Nessun contratto corrispondente.")}
          </p>
          <Button variant="link" onClick={reset}>
            {t("Reimposta filtri")}
          </Button>
        </div>
      ) : vista === "fasi" ? (
        <div className="overflow-x-auto pb-3">
          <div className="grid min-w-[1300px] grid-cols-5 gap-3">
            {Object.entries(FASI_CONTRATTO).map(([stato, label]) => {
              const gruppo = filtrate.filter(
                (r) => r.contratto.stato === stato,
              );
              const limite = limiti[stato] || 20;
              return (
                <section
                  key={stato}
                  className="min-w-0 self-start rounded-xl border bg-muted/30"
                >
                  <div className="flex items-center justify-between border-b p-3">
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <Badge variant="secondary">{gruppo.length}</Badge>
                  </div>
                  <div className="space-y-2 p-2">
                    {gruppo.length === 0 ? (
                      <p className="p-4 text-center text-xs text-muted-foreground">
                        {t("Nessun contratto in questa fase")}
                      </p>
                    ) : (
                      gruppo
                        .slice(0, limite)
                        .map(scheda)
                    )}
                    {gruppo.length > limite && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          setLimiti((l) => ({ ...l, [stato]: limite + 20 }))
                        }
                      >
                        {t("Mostra altri 20")}
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : vista === "schede" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibili.map(scheda)}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-background md:block">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">{t("Contratto / commessa")}</th>
                  <th className="p-3 font-medium">{t("Stato lavori")}</th>
                  <th className="p-3 font-medium">{t("Firma")}</th>
                  <th className="p-3 text-right font-medium">
                    {t("Valore con oneri")}
                  </th>
                  <th className="p-3 font-medium">{t("Avanzamento SAL")}</th>
                  <th className="p-3 text-right font-medium">
                    {t("Netto SAL non pagati")}
                  </th>
                  <th className="p-3 font-medium">{t("Fine prevista")}</th>
                  {onCommessa && <th className="p-3 font-medium">{t("Commessa")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibili.map(({ contratto: c, riepilogo: r, firma: f }) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => onApri(c.id)}
                  >
                    <td className="max-w-xs p-3">
                      <button
                        className="text-left font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApri(c.id);
                        }}
                      >
                        {c.numero_contratto || t("Contratto senza numero")}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.commessa?.order_code} ·{" "}
                        {c.commessa?.description || c.descrizione_lavori}
                      </p>
                      {r.avvisi.length > 0 && (
                        <p className="mt-1 text-xs text-amber-800">{t("{n} verifiche contabili", { n: r.avvisi.length })}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <Stato stato={c.stato} />
                    </td>
                    <td className="p-3 text-xs">{t(FIRME[f])}</td>
                    <td className="whitespace-nowrap p-3 text-right tabular-nums">
                      {euroSub(r.valore)}
                    </td>
                    <td className="p-3">
                      <Avanzamento r={r} />
                    </td>
                    <td className="whitespace-nowrap p-3 text-right tabular-nums">
                      {euroSub(r.daPagare)}
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs">
                      {data(c.data_fine_prevista)}
                    </td>
                    {onCommessa && (
                      <td className="p-3"><div className="flex flex-wrap gap-1.5">
                        {azioneLavorazioni(c)}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCommessa(c.order_id);
                          }}
                        >
                          {t("Apri commessa")}
                        </Button>
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {visibili.map((r) => (
              <div key={r.contratto.id}>
                <Scheda riga={r} onApri={onApri} />
                <div className="mt-2 flex flex-wrap gap-1.5">{azioneLavorazioni(r.contratto)}
                {onCommessa && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCommessa(r.contratto.order_id)}
                  >
                    {t("Apri commessa")}
                  </Button>
                )}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {vista !== "fasi" && filtrate.length > 20 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("{da}–{a} di {n}", { da: corrente * 20 + 1, a: Math.min((corrente + 1) * 20, filtrate.length), n: filtrate.length })}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={corrente === 0}
              onClick={() => setPagina(corrente - 1)}
            >
              {t("Precedenti")}
            </Button>
            <Button
              variant="outline"
              disabled={corrente === ultima}
              onClick={() => setPagina(corrente + 1)}
            >
              {t("Successivi")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
