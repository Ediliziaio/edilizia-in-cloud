/**
 * Simulatore — editor (placeholder).
 *
 * Editor di una singola simulazione. Implementazione completa in Task 7+.
 */
import { useParams } from "react-router-dom";

export default function SimulatoreEditor() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Editor simulazione {id}</h1>
    </div>
  );
}
