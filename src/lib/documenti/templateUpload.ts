import { validaFileTemplate } from './templateCompilazione';

export interface TemplateRegistro {
  id: string; company_id: string; nome: string; descrizione: string | null;
  tipo_doc: string; file_url: string; file_type: 'pdf' | 'docx'; file_size: number;
}
export interface TemplateUploadDeps {
  upload: (path: string, file: File) => Promise<void>;
  register: (row: TemplateRegistro) => Promise<void>;
  registered: (id: string) => Promise<boolean>;
  remove: (path: string) => Promise<void>;
}
export async function caricaTemplateDocumento(
  deps: TemplateUploadDeps,
  companyId: string,
  input: { file: File; nome: string; descrizione?: string; tipo_doc: string },
): Promise<string> {
  if (!/^[a-f0-9-]{36}$/i.test(companyId)) throw new Error('Seleziona prima un’azienda valida.');
  if (!input.nome.trim()) throw new Error('Indica il nome del modello.');
  await validaFileTemplate(input.file);
  const id = crypto.randomUUID();
  const ext = input.file.name.split('.').pop()!.toLowerCase() as 'pdf' | 'docx';
  const path = `${companyId}/${id}.${ext}`;
  await deps.upload(path, input.file);
  try {
    await deps.register({ id, company_id: companyId, nome: input.nome.trim(),
      descrizione: input.descrizione?.trim() || null, tipo_doc: input.tipo_doc,
      file_url: path, file_type: ext, file_size: input.file.size });
  } catch (error) {
    // A lost response is not proof that INSERT failed. Recover by stable ID
    // before deleting anything, avoiding orphan records or a double upload.
    let exists: boolean;
    try { exists = await deps.registered(id); }
    catch { throw new Error('Salvataggio non verificabile. Il file è conservato: aggiorna l’elenco prima di riprovare.'); }
    if (exists) return id;
    try { await deps.remove(path); }
    catch { throw new Error('Registrazione non riuscita. Il file è conservato nell’archivio privato per il recupero.'); }
    throw error;
  }
  return id;
}
