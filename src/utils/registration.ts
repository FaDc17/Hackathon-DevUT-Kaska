export const PASSWORD_HINT = "Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo (máximo 72 bytes).";

export function passwordError(value: string): string {
  if ([...value].length < 8 || new TextEncoder().encode(value).length > 72 ||
      !/\p{Lu}/u.test(value) || !/\p{Ll}/u.test(value) || !/[0-9]/.test(value) ||
      !/[^\p{L}\p{N}\s]/u.test(value)) return PASSWORD_HINT;
  return "";
}

/** SQL and SQLite store nine digits. Other country codes cannot be stored safely. */
export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  const national = compact.startsWith("+51") ? compact.slice(3) : compact;
  if (!/^9[0-9]{8}$/.test(national))
    throw new Error("Ingresa un celular peruano de 9 dígitos o con prefijo +51.");
  return national;
}
