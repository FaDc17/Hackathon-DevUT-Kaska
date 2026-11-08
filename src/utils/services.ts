import { defaultPriceRange } from "../data/demo";
import type { Service } from "../types";

function normalizeCategory(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function getServiceCategoryIcon(category: string) {
  const normalized = normalizeCategory(category);

  if (/gasfiter|fontaner|plomer|tuber|agua|grifo/.test(normalized)) return "drop";
  if (/electric|cable|luminaria|tomacorriente/.test(normalized)) return "bolt";
  if (/carpinter|muebl/.test(normalized)) return "hammer";
  if (/clase|educacion|tutor|curso/.test(normalized)) return "book";
  if (/mascot|perro|gato|animal|veterin/.test(normalized)) return "paw";
  if (/transport|taxi|mudanza|vehiculo/.test(normalized)) return "car";
  if (/hogar|limpieza|costura/.test(normalized)) return "home";
  if (/jardin|paisaj|plant/.test(normalized)) return "leaf";
  if (/belleza|peluquer|estetic/.test(normalized)) return "scissors";
  if (/tecnolog|comput|informat|celular/.test(normalized)) return "computer";
  if (/evento|celebr|fiesta/.test(normalized)) return "calendar";

  return "grid";
}

export function getServicePriceLabel(service: Service) {
  return service.priceLabel &&
    !/actualizar|definir|tratar/i.test(service.priceLabel) &&
    !service.priceLabel.includes("$")
    ? service.priceLabel
    : defaultPriceRange.label;
}
