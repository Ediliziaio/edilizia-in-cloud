// src/components/orders/generali/vendita/scarica.ts
// Scarica un file preparato nel browser (scheda vendita, listino) col suo nome.
export function scaricaBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
