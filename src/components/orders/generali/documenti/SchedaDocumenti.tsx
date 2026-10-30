// src/components/orders/generali/documenti/SchedaDocumenti.tsx
// La scheda «Documenti» della commessa generale: la checklist del modello (sul contratto o
// sull'operazione, poi su ogni ordine di lavoro o unità) e, sotto, l'archivio della generale.
// Da telefono si legge soltanto: un elenco compatto, toccando una voce si apre il file.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, MoreHorizontal, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { PannelloVoce } from "@/components/orders/generali/documenti/PannelloVoce";
import { IconaStato } from "@/components/orders/generali/documenti/IconaStato";
import { COLORE_TONO, nomeBreve, testoBreve, tonoCasella } from "@/components/orders/generali/documenti/statoVisivo";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useChecklistGenerale, type ChecklistGenerale } from "@/hooks/useGeneraleDocumenti";
import { DEFINIZIONI_MODELLI, type FigliaGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import {
  etichettaAmbito, riepilogoVoceFiglie, testoCasella, testoConteggi,
  type CasellaDocumento, type ChecklistDocumenti, type ConteggiDocumenti,
} from "@/lib/orders/generali/documenti";
import { cn } from "@/lib/utils";

export function SchedaDocumenti({ riepilogo: r, puoModificare }: PropsScheda) {
  const isMobile = useIsMobile();
  const dati = useChecklistGenerale(r);
  if (dati.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  if (dati.isError || !dati.checklist) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm">
        <p>Non riesco a leggere i documenti di questa commessa generale.</p>
        <Button size="sm" variant="outline" onClick={dati.refetch}>Riprova</Button>
      </div>
    );
  }
  return isMobile
    ? <DocumentiTelefono r={r} checklist={dati.checklist} />
    : <DocumentiComputer r={r} dati={dati} checklist={dati.checklist} puoModificare={puoModificare} />;
}

/** «12 di 15 presenti · 3 documenti mancanti, 1 in scadenza». */
function riassunto(c: ConteggiDocumenti): string {
  const parti = [c.richiesti === 0 ? "Nessun documento obbligatorio" : `${c.presenti} di ${c.richiesti} obbligatori presenti`];
  const testo = testoConteggi(c);
  if (testo) parti.push(testo);
  if (c.senzaData > 0) parti.push(c.senzaData === 1 ? "1 senza scadenza" : `${c.senzaData} senza scadenza`);
  return parti.join(" · ");
}

const ORDINE_GRAVITA = (c: CasellaDocumento) =>
  c.stato === "scaduto" ? 0
    : c.stato === "mancante" && c.obbligatoria ? 1
      : c.stato === "in_scadenza" ? 2
        : c.senzaData ? 3
          : c.stato === "mancante" ? 4
            : c.stato === "presente" ? 5 : 6;
/** La casella che dice com'è messa una voce su tutte le figlie: la più grave. */
const peggiore = (caselle: readonly CasellaDocumento[]) => [...caselle].sort((a, b) => ORDINE_GRAVITA(a) - ORDINE_GRAVITA(b))[0];

const nomeFiglia = (f: Pick<FigliaGenerale, "codice" | "nome">) => [f.codice, f.nome].filter(Boolean).join(" · ");

// ── Computer e tablet ────────────────────────────────────────────────────────

function DocumentiComputer({ r, dati, checklist, puoModificare }: {
  r: RiepilogoGenerale; dati: ChecklistGenerale; checklist: ChecklistDocumenti; puoModificare: boolean;
}) {
  const permissions = usePermissions();
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const modello = r.generale.modello;
  const puoCambiareElenco = permissions.isAdmin || permissions.canViewSettingsOrders;
  const allegatiDi = (orderId: string) => dati.allegatiPer.get(orderId) ?? [];

  return (
    <div className="space-y-4">
      <section aria-labelledby="documenti-titolo" className="rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 id="documenti-titolo" className="text-base font-semibold">Documenti richiesti</h2>
            <p className="text-xs text-muted-foreground">{riassunto(checklist.conteggi)}</p>
          </div>
          {puoCambiareElenco && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/azienda/impostazioni/cartelle-documenti#documenti-generali">
                <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Cambia l'elenco
              </Link>
            </Button>
          )}
        </header>

        {checklist.generale.length > 0 && (
          <div className="py-2">
            <h3 className="px-4 py-1 text-xs font-medium text-muted-foreground">{etichettaAmbito(modello, "generale")}</h3>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {checklist.generale.map((c) => (
                  <tr key={c.voce.id} className="hover:bg-muted/30">
                    <td className="w-9 py-2 pl-4 pr-1"><IconaStato c={c} /></td>
                    <td className="px-2 py-2">
                      <span className="font-medium">{c.voce.nome}</span>
                      {!c.obbligatoria && c.stato !== "non_serve" && <span className="ml-1.5 text-xs text-muted-foreground">facoltativo</span>}
                    </td>
                    <td className="max-w-[16rem] px-2 py-2 text-xs">
                      {c.documenti.length === 0 ? <span className="text-muted-foreground">—</span> : (
                        <button type="button" onClick={() => void openAttachmentInTab(c.documenti[0].allegato.file_url)} className="block max-w-full truncate text-left hover:underline">
                          {c.documenti[0].allegato.file_name}
                          {c.documenti.length > 1 && <span className="text-muted-foreground"> +{c.documenti.length - 1}</span>}
                        </button>
                      )}
                    </td>
                    <td className={cn("whitespace-nowrap px-2 py-2 text-xs", COLORE_TONO[tonoCasella(c)])}>{testoCasella(c)}</td>
                    <td className="w-32 py-1.5 pl-2 pr-4 text-right">
                      <Popover>
                        <PopoverTrigger asChild>
                          {puoModificare && c.stato === "mancante" ? (
                            <Button size="sm" variant="outline" className="h-8"><Upload className="mr-1.5 h-3.5 w-3.5" /> Carica</Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Dettagli di ${c.voce.nome}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          )}
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80">
                          <PannelloVoce casella={c} generaleId={r.generale.id} allegati={allegatiDi(r.generale.id)} puoModificare={puoModificare} />
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {checklist.figlie.length > 0 && (
          <div className="border-t py-2">
            <h3 className="px-4 py-1 text-xs font-medium text-muted-foreground">{etichettaAmbito(modello, "figlia")}</h3>
            {r.figlie.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Quando aggiungi {def.figlia.tante.toLowerCase()}, qui vedi per ognuna: {checklist.figlie.map((g) => nomeBreve(g.voce.nome)).join(", ")}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">{def.figlia.tante}</th>
                      {checklist.figlie.map((g) => (
                        <th key={g.voce.id} className="px-2 py-2 font-medium" title={g.voce.aiuto ?? g.voce.nome}>
                          {nomeBreve(g.voce.nome)}
                          {!g.voce.obbligatoria && <span className="block font-normal">facoltativo</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {r.figlie.map((f, i) => (
                      <tr key={f.id} className="hover:bg-muted/30">
                        <td className="max-w-[16rem] px-4 py-1.5">
                          <Link to={`/azienda/ordini/${f.id}`} className="block truncate hover:underline">
                            {f.codice && <span className="mr-1.5 text-xs text-muted-foreground">{f.codice}</span>}
                            <span className="font-medium">{f.nome}</span>
                          </Link>
                        </td>
                        {checklist.figlie.map((g) => {
                          const c = g.caselle[i];
                          return (
                            <td key={g.voce.id} className="px-1 py-1">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                                    aria-label={`${g.voce.nome}, ${nomeFiglia(f)}: ${testoCasella(c)}`}
                                  >
                                    <IconaStato c={c} className="h-3.5 w-3.5" />
                                    <span className={cn("truncate", COLORE_TONO[tonoCasella(c)])}>{testoBreve(c)}</span>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-80">
                                  <PannelloVoce casella={c} generaleId={r.generale.id} dove={nomeFiglia(f)} allegati={allegatiDi(f.id)} puoModificare={puoModificare} />
                                </PopoverContent>
                              </Popover>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {r.figlie.length > 1 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30 text-xs">
                        <td className="px-4 py-2 font-medium">Presenti</td>
                        {checklist.figlie.map((g) => {
                          const s = riepilogoVoceFiglie(g.caselle);
                          return <td key={g.voce.id} className="px-2.5 py-2 tabular-nums">{s.presenti} di {s.valgono}</td>;
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          L'archivio della commessa generale. I file di {def.figlia.tante.toLowerCase()} stanno nelle loro pagine e qui sopra spuntano le loro voci.
        </p>
        <OrderAttachments orderId={r.generale.id} editable={puoModificare} />
      </div>
    </div>
  );
}

// ── Telefono: sola lettura, compatta ─────────────────────────────────────────

function DocumentiTelefono({ r, checklist }: { r: RiepilogoGenerale; checklist: ChecklistDocumenti }) {
  const modello = r.generale.modello;
  const [aperta, setAperta] = useState<string | null>(null);
  const apri = (c: CasellaDocumento) => { if (c.documenti[0]) void openAttachmentInTab(c.documenti[0].allegato.file_url); };
  const figlie = r.figlie.length > 0 ? checklist.figlie : [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{riassunto(checklist.conteggi)}</p>
      {checklist.generale.length > 0 && (
        <section aria-label={etichettaAmbito(modello, "generale")}>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{etichettaAmbito(modello, "generale")}</h3>
          <ul className="divide-y rounded-lg border bg-card">
            {checklist.generale.map((c) => (
              <li key={c.voce.id}>
                <RigaTelefono c={c} nome={nomeBreve(c.voce.nome)} onClick={c.documenti[0] ? () => apri(c) : undefined} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {figlie.length > 0 && (
        <section aria-label={etichettaAmbito(modello, "figlia")}>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{etichettaAmbito(modello, "figlia")}</h3>
          <ul className="divide-y rounded-lg border bg-card">
            {figlie.map((g) => {
              const s = riepilogoVoceFiglie(g.caselle);
              const espansa = aperta === g.voce.id;
              return (
                <li key={g.voce.id}>
                  <button
                    type="button"
                    onClick={() => setAperta(espansa ? null : g.voce.id)}
                    aria-expanded={espansa}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left active:bg-muted/60"
                  >
                    <IconaStato c={peggiore(g.caselle)} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{nomeBreve(g.voce.nome)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.presenti} di {s.valgono}</span>
                    {espansa ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  </button>
                  {espansa && (
                    <ul className="divide-y border-t bg-muted/20">
                      {r.figlie.map((f, i) => {
                        const c = g.caselle[i];
                        return (
                          <li key={f.id}>
                            <RigaTelefono c={c} nome={f.codice ?? f.nome} rientrata onClick={c.documenti[0] ? () => apri(c) : undefined} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function RigaTelefono({ c, nome, rientrata, onClick }: { c: CasellaDocumento; nome: string; rientrata?: boolean; onClick?: () => void }) {
  const contenuto = (
    <>
      <IconaStato c={c} className={rientrata ? "h-3.5 w-3.5" : undefined} />
      <span className="min-w-0 flex-1 truncate text-[13px]">{nome}</span>
      <span className={cn("shrink-0 text-xs", COLORE_TONO[tonoCasella(c)])}>{testoBreve(c)}</span>
    </>
  );
  const classe = cn("flex w-full items-center gap-2 py-2 text-left", rientrata ? "pl-6 pr-3" : "px-3");
  return onClick
    ? <button type="button" onClick={onClick} className={cn(classe, "active:bg-muted/60")}>{contenuto}</button>
    : <div className={classe}>{contenuto}</div>;
}
