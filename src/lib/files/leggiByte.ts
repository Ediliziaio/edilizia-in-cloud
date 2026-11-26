/** Legge anche i file temporanei prodotti dalla fotocamera di WebKit. */
export function leggiByte(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const lettore = new FileReader();
    lettore.onload = () => resolve(lettore.result as ArrayBuffer);
    lettore.onerror = lettore.onabort = () => reject(lettore.error ?? new Error("File non leggibile"));
    lettore.readAsArrayBuffer(blob);
  });
}
