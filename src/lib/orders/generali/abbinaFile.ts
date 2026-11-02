// src/lib/orders/generali/abbinaFile.ts
// Caricare insieme i file di tante unità: «A1.pdf», «pianta_A2_v3.pdf» vanno da soli sull'unità
// giusta. La sigla deve comparire come parola intera; se il nome ne contiene due non si indovina.

export interface UnitaAbbinabile { orderId: string; sigla: string }

const normale = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** L'unità del file, oppure null se il nome non ne indica una sola. */
export function unitaDelFile(nomeFile: string, unita: readonly UnitaAbbinabile[]): string | null {
  const nome = normale(nomeFile.replace(/\.[^.]+$/, ""));
  const trovate = unita.filter((u) => {
    // «A1» vale anche scritto «A-1» o «A 1»: lettere e cifre con al più un separatore in mezzo.
    const parti = normale(u.sigla).match(/\p{L}+|\p{N}+/gu);
    if (!parti) return false;
    const corpo = parti.join("[-_ ]?");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${corpo}($|[^\\p{L}\\p{N}])`, "u").test(nome);
  });
  return trovate.length === 1 ? trovate[0].orderId : null;
}

export interface FileAbbinato<F> { file: F; orderId: string | null }

export function abbinaFile<F extends { name: string }>(file: readonly F[], unita: readonly UnitaAbbinabile[]): FileAbbinato<F>[] {
  return file.map((f) => ({ file: f, orderId: unitaDelFile(f.name, unita) }));
}
