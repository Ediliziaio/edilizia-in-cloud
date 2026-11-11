import { lazy, Suspense, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { FvDisegnoPreventivoProps } from "../FvDisegnoPreventivo";
import { ArchivioRilieviContext, creaArchivioRilievi, type ArchivioRilievi } from "./archivioRilievi";
const EditorTetto = lazy(() => import("./FvEditorTettoInterno"));
/** Il motore 3D viene caricato soltanto quando si apre la finestra di posa. */
export default function FvEditorTetto(props: FvDisegnoPreventivoProps & {
    archivio?: ArchivioRilievi;
}) {
    const { effectiveCompany } = useAuth();
    const companyId = props.companyId ?? effectiveCompany?.id;
    const archivio = useMemo(() => props.archivio ?? (companyId ? creaArchivioRilievi(companyId) : null), [props.archivio, companyId]);
    if (!archivio)
        return <p role="alert">Seleziona l’azienda prima di aprire il simulatore del tetto.</p>;
    return <ArchivioRilieviContext.Provider value={archivio}><Suspense fallback={<p role="status" className="p-6">Caricamento del simulatore 2D e 3D…</p>}><EditorTetto key={companyId} {...props}/></Suspense></ArchivioRilieviContext.Provider>;
}
