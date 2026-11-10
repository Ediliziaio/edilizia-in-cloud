import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { controlloPrimaDellUso, NOMI_USO_PIANTA, type UsoPlanimetria } from "../../../shared/planimetrie/verificaDocumento.ts";
import { Button } from "@/components/ui/button";

export function StatoVerificaDocumento({ documento, modifica }: { documento: Planimetria; modifica?: string }) {
  const c = controlloPrimaDellUso(documento, "render");
  if (!documento.letturaDocumento && c.ok) return null;
  return <section aria-label="Controllo prima di utilizzare la pianta" className={`rounded-xl border p-3 text-sm ${c.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 font-semibold">{c.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{c.ok ? "Documento verificato su questo disegno" : `${c.daVerificare.length + c.problemi.length} controlli da completare`}</p>{modifica && !c.ok && <Button size="sm" variant="outline" asChild><Link to={modifica}>Confronta e verifica</Link></Button>}</div>
    <p className="mt-1 text-xs">{c.ok ? "Le conferme sono salvate con la pianta. Se cambia la geometria interessata, il controllo si riapre." : "Completa le verifiche prima di usare la pianta per 3D, render, computo e PDF. Puoi continuare a modificarla e salvarla come bozza."}</p>
    <div className="mt-2 flex flex-wrap gap-2 text-xs">{Object.entries(NOMI_USO_PIANTA).map(([k, nome]) => <span key={k} className="rounded-md border border-current/15 bg-white/60 px-2 py-1">{nome}: {c.ok ? "pronto" : "da verificare"}</span>)}</div>
  </section>;
}

export function ControlloUsoBloccato({ documento, uso, modifica }: { documento: Planimetria; uso: UsoPlanimetria; modifica?: string }) {
  const c = controlloPrimaDellUso(documento, uso);
  if (c.ok) return null;
  return <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-semibold">Prima di {NOMI_USO_PIANTA[uso]}, verifica il documento</h3><ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5">{[...c.problemi, ...c.daVerificare.map((v) => v.descrizione)].map((s, i) => <li key={i}>{s}</li>)}</ul>{modifica && <Button asChild size="sm" variant="outline"><Link to={modifica}>Apri confronto foto e pianta</Link></Button>}</div>;
}
