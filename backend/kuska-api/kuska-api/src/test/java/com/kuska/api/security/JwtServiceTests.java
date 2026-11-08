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
}
