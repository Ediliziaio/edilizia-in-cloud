export function ResultText({ text }: { text: string }) {
  if (text.length < 280) return <p className="ga-result-text">{text}</p>;
  const first = text.split(/\n/).find(line => line.trim()) || text;
  const excerpt = first.length > 180 ? `${first.slice(0, 180).replace(/\s+\S*$/, '')}…` : first;
  return <div className="ga-result-text"><p>{excerpt}</p><details className="ga-details-help"><summary>Leggi il risultato completo</summary><div className="whitespace-pre-wrap">{text}</div></details></div>;
}
