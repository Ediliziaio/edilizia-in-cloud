import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProdottiSds } from "@/hooks/useProdottiSds";
import { useFasiFascicolo } from "@/hooks/useFascicoloCantiere";
import { oggiSicurezza } from "@/lib/sicurezza/fascicolo";
import { fotografaProdottoPos } from "@/lib/sicurezza/prodottiPos";
import { avvisiProdottoSds } from "@/lib/sicurezza/prodottiSds";
import {
  erroriProdottoPos,
  invalidaProdottiLavorazione,
} from "../../../../supabase/functions/_shared/posProdotti";
import type {
  Lavorazione,
  PosContenuto,
} from "../../../../supabase/functions/_shared/posModello";
import type { Modifica } from "./PosSezioni";
export function ProdottiLavorazionePos({
  companyId,
  orderId,
  d,
  l,
  n,
  modifica,
  ro,
}: {
  companyId: string;
  orderId: string;
  d: PosContenuto;
  l: Lavorazione;
  n: number;
  modifica: Modifica;
  ro: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState("");
  const data = d.opera.data_inizio || oggiSicurezza();
  const q = useProdottiSds({ companyId, orderId, data }, aperto && !ro);
  const fasi = useFasiFascicolo(companyId, orderId);
  const prodotti = l.prodotti || [];
  const disponibili = (q.data?.impieghi || []).filter(
    (p) =>
      !p.annullato &&
      !p.subappaltatore_id &&
      (!p.fase_id || p.fase_id === l.fase_id) &&
      (!d.opera.data_fine || p.dal <= d.opera.data_fine) &&
      (!p.al || p.al >= data),
  );
  const sceltoP = disponibili.find((p) => p.id === scelto);
  const cambia = (fn: (l: Lavorazione) => void) =>
    modifica((x) => {
      const v = x.lavorazioni[n];
      fn(v);
      v.prodotti_riesaminati = false;
      if (v.origine !== "utente") v.verificata = false;
    });
  return (
    <div className="space-y-3 rounded-lg border bg-white p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Prodotti e SDS di questa lavorazione ({prodotti.length})
        </p>
        {!ro && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAperto((v) => !v)}
          >
            {aperto
              ? "Chiudi inventario"
              : "Scegli dall’inventario di commessa"}
          </Button>
        )}
      </div>
      {!ro && (
        <label className="block text-xs">
          Fase della lavorazione
          <select
            aria-label={`Fase della lavorazione ${n + 1}`}
            className="mt-1 w-full rounded border bg-background p-2 text-sm"
            value={l.fase_id || ""}
            disabled={fasi.isLoading || fasi.isError}
            onChange={(e) =>
              cambia((v) => {
                v.fase_id = e.target.value || null;
                invalidaProdottiLavorazione(v);
              })
            }
          >
            <option value="">Comune a più fasi / da precisare</option>
            {fasi.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {fasi.isError && (
        <p role="alert" className="text-sm text-destructive">
          Fasi non disponibili: non confermare una nuova associazione.
        </p>
      )}
      {aperto && !ro && (
        <div className="space-y-2 rounded border bg-muted/20 p-3">
          {q.isLoading ? (
            <p role="status">Caricamento inventario…</p>
          ) : q.isError || !q.data ? (
            <p role="alert">
              Inventario non disponibile. Le fotografie già nel POS restano
              conservate.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Prodotti della propria impresa nel periodo del POS. Scegli la
                fase per vedere gli impieghi specifici. Per aggiungere prodotti
                o rettificare una SDS usa Sicurezza nella commessa.
              </p>
              <select
                aria-label={`Prodotto da collegare alla lavorazione ${n + 1}`}
                className="w-full rounded border bg-background p-2 text-sm"
                value={scelto}
                onChange={(e) => setScelto(e.target.value)}
              >
                <option value="">Scegli un impiego registrato</option>
                {disponibili.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {p.codice || p.id.slice(0, 8)} · v{p.versione}
                  </option>
                ))}
              </select>
              {sceltoP && (
                <div className="text-xs">
                  {avvisiProdottoSds(sceltoP, data).map((a) => (
                    <p key={a} className="text-amber-800">
                      {a}
                    </p>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !sceltoP ||
                  q.isFetching ||
                  fasi.isLoading ||
                  fasi.isError ||
                  prodotti.some((p) => p.impiego_id === scelto)
                }
                onClick={() => {
                  if (sceltoP)
                    cambia((v) => {
                      v.prodotti = [
                        ...(v.prodotti || []),
                        fotografaProdottoPos(sceltoP),
                      ];
                    });
                  setScelto("");
                }}
              >
                Collega prodotto da riesaminare
              </Button>
              {!disponibili.length && (
                <p className="text-xs text-muted-foreground">
                  Nessun impiego proprio pertinente. Registra i prodotti
                  nell’inventario; questa assenza non prova che non siano usati
                  prodotti pericolosi.
                </p>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Rileggi inventario
          </Button>
        </div>
      )}
      {prodotti.map((p, i) => {
        const attuale = q.data?.impieghi.find((v) => v.id === p.impiego_id);
        const cambiato =
          attuale &&
          (attuale.versione !== p.versione ||
            attuale.documento_cambiato ||
            attuale.materiale_cambiato ||
            attuale.annullato);
        const errori = erroriProdottoPos(p, l.fase_id);
        return (
          <article
            key={`${p.impiego_id}:${i}`}
            className="space-y-2 rounded border p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {p.nome} · v{p.versione}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.produttore || "Produttore non indicato"} ·{" "}
                  {p.codice || "Codice non indicato"}
                </p>
                <p>{p.impiego}</p>
                <p className="text-xs">
                  SDS{" "}
                  {p.sds_necessaria === "si"
                    ? `rev. ${p.sds_revisione || "non indicata"} · ${p.sds_data || "data non indicata"}`
                    : p.sds_necessaria === "no"
                      ? `dichiarata non necessaria: ${p.motivo_non_necessaria || "motivo da indicare"}`
                      : "da valutare"}
                </p>
              </div>
              {!ro && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    cambia((v) => {
                      v.prodotti = v.prodotti?.filter(
                        (_, index) => index !== i,
                      );
                    })
                  }
                >
                  Togli prodotto
                </Button>
              )}
            </div>
            {cambiato && (
              <div>
                <p role="alert" className="text-xs text-amber-800">
                  La fonte è cambiata. Il POS conserva la versione scelta;
                  riesamina l’inventario prima di aggiornare questa fotografia.
                </p>
                {!attuale.annullato &&
                  !attuale.materiale_cambiato &&
                  !attuale.documento_cambiato &&
                  !ro && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        cambia((v) => {
                          v.prodotti![i] = fotografaProdottoPos(attuale);
                        })
                      }
                    >
                      Proponi versione aggiornata del prodotto
                    </Button>
                  )}
              </div>
            )}
            {!ro && aperto && !q.isError && q.data && !attuale && (
              <p role="alert" className="text-xs text-amber-800">
                Impiego originario non disponibile: non sostituirlo con un
                omonimo.
              </p>
            )}
            {errori.length > 0 && (
              <p className="text-xs text-amber-800">{errori.join(" · ")}</p>
            )}
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={p.verificato}
                disabled={ro || !!cambiato}
                onChange={(e) =>
                  modifica((x) => {
                    x.lavorazioni[n].prodotti![i].verificato = e.target.checked;
                  })
                }
              />
              Ho riesaminato questo prodotto e la versione SDS indicata per la
              lavorazione.
            </label>
          </article>
        );
      })}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={l.prodotti_riesaminati === true}
          disabled={ro}
          onChange={(e) =>
            modifica((x) => {
              x.lavorazioni[n].prodotti_riesaminati = e.target.checked;
            })
          }
        />
        Ho verificato l’elenco dei prodotti realmente usati in questa
        lavorazione, anche quando non sono previste sostanze pericolose.
      </label>
      <p className="text-xs text-muted-foreground">
        La conferma non è una valutazione del rischio chimico. All’approvazione
        vengono ricontrollate versioni, copertura del periodo e SDS; i POS già
        emessi restano invariati.
      </p>
    </div>
  );
}
