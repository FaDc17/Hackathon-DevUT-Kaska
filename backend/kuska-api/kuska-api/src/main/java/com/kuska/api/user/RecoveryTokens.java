package com.kuska.api.user;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/** Prepared primitive, deliberately NOT exposed through an HTTP endpoint.
 * A verified delivery channel must be authorized before integrating it.
 * Memory-only: restart invalidates tokens; multiple instances need a shared atomic store.
 */
final class RecoveryTokens {
    private record Entry(String userId, byte[] hash, Instant expires, int attempts) { }
    private final Map<String, Entry> entries = new HashMap<>();
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    RecoveryTokens(Clock clock) { this.clock = clock; }
    synchronized String issue(String challengeId, String userId) {
        entries.entrySet().removeIf(e -> !e.getValue().expires().isAfter(clock.instant()));
        if (entries.size() >= 1000 || entries.containsKey(challengeId) ||
            entries.values().stream().anyMatch(e -> e.userId().equals(userId)))
            throw new IllegalStateException("Espera antes de solicitar otra verificación.");
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        entries.put(challengeId, new Entry(userId, hash(token), clock.instant().plus(Duration.ofMinutes(10)), 0));
        return token; // Deliver only through the verified channel, never in an API response/log.
    }
    synchronized Optional<String> consume(String challengeId, String token) {
        Entry entry = entries.get(challengeId);
        if (entry == null) return Optional.empty();
        if (!entry.expires().isAfter(clock.instant()) || entry.attempts() >= 5) {
            entries.remove(challengeId); return Optional.empty();
        }
        if (token == null || token.length() > 128 || !MessageDigest.isEqual(entry.hash(), hash(token))) {
            entries.put(challengeId, new Entry(entry.userId(), entry.hash(), entry.expires(), entry.attempts() + 1));
            return Optional.empty();
        }
        entries.remove(challengeId);
        return Optional.of(entry.userId());
    }
    private byte[] hash(String token) {
        try { return MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
