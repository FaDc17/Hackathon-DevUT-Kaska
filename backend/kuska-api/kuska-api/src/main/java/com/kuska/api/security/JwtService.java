package com.kuska.api.security;

import java.time.Instant;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

@Service
public class JwtService {

	private final SecretKey signingKey;
	private final long expirationMillis;

	public JwtService(
			@Value("${kuska.security.jwt.secret}") String encodedSecret,
			@Value("${kuska.security.jwt.expiration-ms:900000}") long expirationMillis) {
		byte[] keyBytes = Decoders.BASE64.decode(encodedSecret);
		if (keyBytes.length < 32) {
			throw new IllegalArgumentException("JWT_SECRET debe contener al menos 256 bits en Base64.");
		}
		if (expirationMillis < 60_000 || expirationMillis > 3_600_000) {
			throw new IllegalArgumentException("La expiración JWT debe estar entre 1 y 60 minutos.");
		}
		this.signingKey = Keys.hmacShaKeyFor(keyBytes);
		this.expirationMillis = expirationMillis;
	}

	public String createAccessToken(UsuarioTokenSubject subject) {
		return createAccessToken(subject, Instant.now());
	}

	private String createAccessToken(UsuarioTokenSubject subject, Instant authenticatedAt) {
		Instant issuedAt = Instant.now();
		Instant deadline = authenticatedAt.plusSeconds(8 * 60 * 60);
		Instant expires = issuedAt.plusMillis(expirationMillis);
		if (expires.isAfter(deadline)) expires = deadline;
		if (!expires.isAfter(issuedAt)) throw new IllegalArgumentException("La sesión alcanzó su duración máxima.");
		return Jwts.builder()
				.subject(subject.id())
				.claim("username", subject.username())
				.claim("auth_time", authenticatedAt.getEpochSecond())
				.issuedAt(Date.from(issuedAt))
				.expiration(Date.from(expires))
				.signWith(signingKey)
				.compact();
	}

	/** Renewal requires a signed, unexpired token and retains the original 8-hour deadline. */
	public String renewAccessToken(String token, UsuarioTokenSubject subject) {
		parse(token);
		Claims claims = Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token).getPayload();
		if (!subject.id().equals(claims.getSubject())) throw new IllegalArgumentException("Identidad inválida.");
		Number start = claims.get("auth_time", Number.class);
		Instant authenticatedAt = start == null ? claims.getIssuedAt().toInstant() : Instant.ofEpochSecond(start.longValue());
		if (authenticatedAt.isAfter(Instant.now())) throw new IllegalArgumentException("Sesión inválida.");
		return createAccessToken(subject, authenticatedAt);
	}

	public AuthenticatedUser parse(String token) {
		Claims claims = Jwts.parser()
				.verifyWith(signingKey)
				.build()
				.parseSignedClaims(token)
				.getPayload();
		String id = claims.getSubject();
		String username = claims.get("username", String.class);
		if (id == null || id.isBlank() || username == null || username.isBlank()) {
			throw new IllegalArgumentException("Token inválido.");
		}
		return new AuthenticatedUser(id, username);
	}

	public long getExpirationSeconds() {
		return expirationMillis / 1000;
	}

	public record UsuarioTokenSubject(String id, String username) {
	}
}
