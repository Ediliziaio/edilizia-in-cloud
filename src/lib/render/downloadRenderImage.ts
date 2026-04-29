export async function downloadRenderImage(resultUrl: string, filename: string): Promise<void> {
  const resp = await fetch(resultUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
