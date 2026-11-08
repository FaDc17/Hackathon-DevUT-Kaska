package com.kuska.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.Date;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

class JwtServiceTests {

	private static final String JWT_SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
	private JwtService jwtService;

	@BeforeEach
	void setUp() {
		jwtService = new JwtService(JWT_SECRET, 900_000);
	}

	@Test
	void signedAccessTokenContainsExpectedIdentity() {
		String token = jwtService.createAccessToken(
				new JwtService.UsuarioTokenSubject("user-1", "vecino"));

		AuthenticatedUser user = jwtService.parse(token);

		assertEquals("user-1", user.id());
		assertEquals("vecino", user.username());
	}

	@Test
	void expiredTokenIsRejected() {
		Instant now = Instant.now();
		String token = Jwts.builder()
				.subject("user-1")
				.claim("username", "vecino")
				.issuedAt(Date.from(now.minusSeconds(120)))
				.expiration(Date.from(now.minusSeconds(60)))
				.signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(JWT_SECRET)))
				.compact();

		assertThrows(ExpiredJwtException.class, () -> jwtService.parse(token));
	}

	@Test
	void renewalPreservesOriginalAuthenticationDeadline() {
		Instant start = Instant.now().minusSeconds(8 * 3600 - 30);
		String token = signedToken(start, Instant.now().plusSeconds(120));
		String renewed = jwtService.renewAccessToken(token, new JwtService.UsuarioTokenSubject("user-1", "vecino"));
		var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(JWT_SECRET)))
			.build().parseSignedClaims(renewed).getPayload();
		assertEquals(start.getEpochSecond(), claims.get("auth_time", Number.class).longValue());
		org.junit.jupiter.api.Assertions.assertTrue(claims.getExpiration().toInstant().isBefore(Instant.now().plusSeconds(31)));
	}

	@Test
	void renewalRejectsExpiredTokensAndAnExhaustedSession() {
		assertThrows(ExpiredJwtException.class, () -> jwtService.renewAccessToken(
			signedToken(Instant.now().minusSeconds(600), Instant.now().minusSeconds(1)),
			new JwtService.UsuarioTokenSubject("user-1", "vecino")));
		assertThrows(IllegalArgumentException.class, () -> jwtService.renewAccessToken(
			signedToken(Instant.now().minusSeconds(8 * 3600 + 1), Instant.now().plusSeconds(60)),
			new JwtService.UsuarioTokenSubject("user-1", "vecino")));
	}

	private String signedToken(Instant authenticatedAt, Instant expiration) {
		return Jwts.builder().subject("user-1").claim("username", "vecino")
			.claim("auth_time", authenticatedAt.getEpochSecond()).issuedAt(Date.from(authenticatedAt))
			.expiration(Date.from(expiration)).signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(JWT_SECRET))).compact();
	}
}
