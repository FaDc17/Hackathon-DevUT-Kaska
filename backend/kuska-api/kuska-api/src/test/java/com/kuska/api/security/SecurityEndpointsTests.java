package com.kuska.api.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Date;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.kuska.api.catalog.CanalAyudaRepository;
import com.kuska.api.catalog.CategoriaServicioRepository;
import com.kuska.api.catalog.DepartamentoRepository;
import com.kuska.api.catalog.DistritoRepository;
import com.kuska.api.catalog.TipoPublicacionRepository;
import com.kuska.api.user.AuthService;
import com.kuska.api.user.UserDtos;
import com.kuska.api.user.UsuarioRepository;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityEndpointsTests {

	private static final String JWT_SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtService jwtService;

	@MockitoBean
	private AuthService authService;

	@MockitoBean
	private DepartamentoRepository departamentoRepository;

	@MockitoBean
	private DistritoRepository distritoRepository;

	@MockitoBean
	private CategoriaServicioRepository categoriaServicioRepository;

	@MockitoBean
	private TipoPublicacionRepository tipoPublicacionRepository;

	@MockitoBean
	private CanalAyudaRepository canalAyudaRepository;

	@MockitoBean
	private UsuarioRepository usuarioRepository;

	@Test
	void privateProfileRejectsMissingToken() throws Exception {
		mockMvc.perform(get("/api/usuarios/me"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error").value("UNAUTHORIZED"));
	}

	@Test
	void privateProfileRejectsInvalidAndExpiredTokens() throws Exception {
		mockMvc.perform(get("/api/usuarios/me").header("Authorization", "Bearer invalid"))
				.andExpect(status().isUnauthorized());
		mockMvc.perform(get("/api/usuarios/me").header("Authorization", "Bearer " + expiredToken()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void validJwtCanAccessOnlyTheAuthenticatedProfileRoute() throws Exception {
		when(authService.profile("user-123")).thenReturn(publicUser());
		String token = jwtService.createAccessToken(
				new JwtService.UsuarioTokenSubject("user-123", "vecino"));

		mockMvc.perform(get("/api/usuarios/me").header("Authorization", "Bearer " + token))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value("user-123"))
				.andExpect(jsonPath("$.username").value("vecino"));
	}

	@Test
	void registerIsPublicButStillValidatesItsPayload() throws Exception {
		when(authService.register(any())).thenReturn(new UserDtos.AuthResponse(
				"token", "Bearer", 900,
				publicUser()));
		mockMvc.perform(post("/api/auth/register")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username":"vecino","password":"secure123","phone":"987654321",
								"address":"Av. Comunidad 123","districtId":12,"about":"Hola"}
								"""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.user.id").value("user-123"));

		mockMvc.perform(post("/api/auth/register")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"username":"","password":"short","phone":"123",
								"address":"","districtId":0}
								"""))
				.andExpect(status().isBadRequest());
	}

	private UserDtos.PublicUser publicUser() {
		return new UserDtos.PublicUser(
				"user-123", "vecino", "987654321", "Av. Comunidad 123",
				12, "Pueblo Libre", "Lima", 15, "Lima", "Hola");
	}

	private String expiredToken() {
		Instant now = Instant.now();
		return Jwts.builder()
				.subject("user-123")
				.claim("username", "vecino")
				.issuedAt(Date.from(now.minusSeconds(120)))
				.expiration(Date.from(now.minusSeconds(60)))
				.signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(JWT_SECRET)))
				.compact();
	}
}
