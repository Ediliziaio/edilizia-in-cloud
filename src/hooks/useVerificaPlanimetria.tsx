import { useState } from "react";
import type { Planimetria } from "../../shared/planimetrie/modello.ts";
import { controlloPrimaDellUso, type UsoPlanimetria } from "../../shared/planimetrie/verificaDocumento.ts";
import { ControlloUsoBloccato } from "@/components/planimetrie/ControlloPrimaDellUso";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function useControlloPrimaDellUso(documento?: Planimetria, modifica?: string) {
  const [bloccato, setBloccato] = useState<UsoPlanimetria | null>(null);
  const primaDi = (uso: UsoPlanimetria, azione: () => void) => {
    if (documento && !controlloPrimaDellUso(documento, uso).ok) { setBloccato(uso); return; }
    azione();
  };
  const dialogo = <Dialog open={!!bloccato} onOpenChange={(v) => { if (!v) setBloccato(null); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Verifica la planimetria</DialogTitle><DialogDescription>Le misure discordanti e i dettagli non riconosciuti restano da controllare.</DialogDescription></DialogHeader>{documento && bloccato && <ControlloUsoBloccato documento={documento} uso={bloccato} modifica={modifica} />}</DialogContent></Dialog>;
  return { primaDi, dialogo };
}
