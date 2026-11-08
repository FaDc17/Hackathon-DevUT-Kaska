/** Presentation only: catalog IDs and names remain untouched. */
export function categoryIcon(name: string): string {
  const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const icons: Record<string, string> = {
    gasfiteria: "drop", electricidad: "bolt", carpinteria: "hammer",
    clases: "book", educacion: "book", mascotas: "paw", transporte: "car",
    hogar: "home", tecnologia: "computer", jardineria: "leaf",
    belleza: "scissors", eventos: "calendar", otros: "grid", "sin especificar": "grid",
  };
  return icons[key] ?? "grid";
}
