package com.kuska.api.user;

import java.nio.charset.StandardCharsets;

final class RegistrationValidation {
    private RegistrationValidation() { }
    static void password(String value) {
        if (value == null || value.codePointCount(0, value.length()) < 8 ||
            value.getBytes(StandardCharsets.UTF_8).length > 72 ||
            value.codePoints().noneMatch(Character::isUpperCase) ||
            value.codePoints().noneMatch(Character::isLowerCase) ||
            !value.matches("(?s).*[0-9].*") ||
            !java.util.regex.Pattern.compile("[^\\p{L}\\p{N}\\s]").matcher(value).find())
            throw new IllegalArgumentException("Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo (máximo 72 bytes).");
    }
    static String phone(String value) {
        String compact = value == null ? "" : value.trim().replaceAll("[\\s()-]", "");
        if (compact.startsWith("+51")) compact = compact.substring(3);
        if (!compact.matches("9[0-9]{8}"))
            throw new IllegalArgumentException("Ingresa un celular peruano de 9 dígitos o con prefijo +51.");
        return compact;
    }
}
