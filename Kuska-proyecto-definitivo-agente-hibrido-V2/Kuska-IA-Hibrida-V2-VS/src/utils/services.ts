import { defaultPriceRange } from "../data/demo";
import type { Service } from "../types";

export function getServicePriceLabel(service: Service) {
  return service.priceLabel &&
    !/actualizar|definir|tratar/i.test(service.priceLabel) &&
    !service.priceLabel.includes("$")
    ? service.priceLabel
    : defaultPriceRange.label;
}
