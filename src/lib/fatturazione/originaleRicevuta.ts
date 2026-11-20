import { supabase } from '@/integrations/supabase/client';
import { xmlDaFile } from '../../../supabase/functions/_shared/ricevuteOpenapi';

interface OriginaleRicevuta {
  xml_raw?: unknown;
  xml_url?: unknown;
  numero_fattura?: unknown;
  cedente_piva?: unknown;
}

/** La vista usa l'XML estratto; il download conserva il file archiviato, anche firmato. */
export async function leggiXmlRicevuta(f: OriginaleRicevuta): Promise<string | null> {
  if (typeof f.xml_raw === 'string' && f.xml_raw.trim()) return f.xml_raw;
  if (typeof f.xml_url !== 'string' || !f.xml_url) return null;
  const { data, error } = await supabase.storage.from('fatture-xml').download(f.xml_url);
  if (error) throw error;
  if (!data) throw new Error('Il file originale non è disponibile.');
  const xml = xmlDaFile(new Uint8Array(await data.arrayBuffer()));
  if (!xml) throw new Error('Il file archiviato non contiene una fattura XML leggibile.');
  return xml;
}

export async function fileOriginaleRicevuta(f: OriginaleRicevuta): Promise<{ dati: Blob; nome: string }> {
  if (typeof f.xml_url === 'string' && f.xml_url) {
    const { data, error } = await supabase.storage.from('fatture-xml').download(f.xml_url);
    if (error) throw error;
    if (!data) throw new Error('Il file originale non è disponibile.');
    return { dati: data, nome: f.xml_url.split('/').pop() || 'fattura.xml' };
  }
  if (typeof f.xml_raw !== 'string' || !f.xml_raw.trim()) throw new Error('Nessun file originale disponibile per questa fattura.');
  const nome = `${f.cedente_piva || 'fattura'}_${f.numero_fattura || 'originale'}`.replace(/[^\p{L}\p{N}._-]/gu, '_');
  return { dati: new Blob([f.xml_raw], { type: 'application/xml' }), nome: `${nome}.xml` };
}

export async function scaricaOriginaleRicevuta(f: OriginaleRicevuta) {
  const { dati, nome } = await fileOriginaleRicevuta(f);
  const url = URL.createObjectURL(dati);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
