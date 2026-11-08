package com.kuska.api.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
	void renewalRequiresAStillValidTokenAndAnActiveAccount() throws Exception {
		mockMvc.perform(post("/api/auth/refresh")).andExpect(status().isUnauthorized());
		mockMvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + expiredToken()))
			.andExpect(status().isUnauthorized());
		String token = jwtService.createAccessToken(new JwtService.UsuarioTokenSubject("user-123", "vecino"));
		when(usuarioRepository.existsByIdAndEstadoTrueAndEliminadoFalse("user-123")).thenReturn(false);
		mockMvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + token))
			.andExpect(status().isUnauthorized());
		verify(authService, never()).renew(any(), any());
	}

	@Test
	void authenticatedRenewalUsesTheVerifiedIdentity() throws Exception {
		when(usuarioRepository.existsByIdAndEstadoTrueAndEliminadoFalse("user-123")).thenReturn(true);
		String token = jwtService.createAccessToken(new JwtService.UsuarioTokenSubject("user-123", "vecino"));
		when(authService.renew("user-123", token)).thenReturn(new UserDtos.AuthResponse("renewed", "Bearer", 900, publicUser()));
		mockMvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").value("renewed"));
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
		when(usuarioRepository.existsByIdAndEstadoTrueAndEliminadoFalse("user-123")).thenReturn(true);
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

	@Test
	void deletedAccountCannotUsePreviouslyValidJwt() throws Exception {
		String token = jwtService.createAccessToken(new JwtService.UsuarioTokenSubject("deleted-user", "vecino"));
		when(usuarioRepository.existsByIdAndEstadoTrueAndEliminadoFalse("deleted-user")).thenReturn(false);
		mockMvc.perform(get("/api/usuarios/me").header("Authorization", "Bearer " + token))
				.andExpect(status().isUnauthorized());
		verify(authService, never()).profile("deleted-user");
	}

	@Test
	void accountDeletionRequiresAuthenticatedOwnerAndExplicitConfirmation() throws Exception {
		mockMvc.perform(delete("/api/usuarios/me").contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"secure123\",\"confirmation\":\"ELIMINAR\"}"))
				.andExpect(status().isUnauthorized());
		when(usuarioRepository.existsByIdAndEstadoTrueAndEliminadoFalse("user-123")).thenReturn(true);
		String token = jwtService.createAccessToken(new JwtService.UsuarioTokenSubject("user-123", "vecino"));
		mockMvc.perform(delete("/api/usuarios/me").header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"secure123\",\"confirmation\":\"SI\"}"))
				.andExpect(status().isBadRequest());
		mockMvc.perform(delete("/api/usuarios/me").header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"secure123\",\"confirmation\":\"ELIMINAR\"}"))
				.andExpect(status().isNoContent());
		verify(authService).deleteAccount("user-123", new UserDtos.AccountDeletionRequest("secure123", "ELIMINAR"));
	}

	@Test
	void healthAndRegistrationCatalogsArePublic() throws Exception {
		mockMvc.perform(get("/actuator/health")).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.components").doesNotExist());
		mockMvc.perform(get("/api/catalogos/departamentos")).andExpect(status().isOk());
	}

	@Test
	void providerProfileDoesNotExposePrivateAddressOrPhone() throws Exception {
		when(usuarioRepository.existsByIdAndEstadoTrueAndEliminadoFalse("user-123")).thenReturn(true);
		when(authService.neighborProfile("provider-1")).thenReturn(new UserDtos.NeighborProfile(
				"provider-1", "vecino", 12, "Pueblo Libre", "Lima", 15, "Lima", "Hola"));
		String token = jwtService.createAccessToken(new JwtService.UsuarioTokenSubject("user-123", "vecino"));
		mockMvc.perform(get("/api/usuarios/provider-1/publico").header("Authorization", "Bearer " + token))
				.andExpect(status().isOk()).andExpect(jsonPath("$.id").value("provider-1"))
				.andExpect(jsonPath("$.address").doesNotExist()).andExpect(jsonPath("$.phone").doesNotExist());
	}

	@Test
	void incorrectDeletionPasswordIsForbiddenWithoutInvalidatingJwt() throws Exception {
		when(usuarioRepository.existsByIdAndEstadoTrueAndEliminadoFalse("user-123")).thenReturn(true);
		org.mockito.Mockito.doThrow(new com.kuska.api.user.AccountVerificationException())
				.when(authService).deleteAccount("user-123", new UserDtos.AccountDeletionRequest("wrong123", "ELIMINAR"));
		String token = jwtService.createAccessToken(new JwtService.UsuarioTokenSubject("user-123", "vecino"));
		mockMvc.perform(delete("/api/usuarios/me").header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"wrong123\",\"confirmation\":\"ELIMINAR\"}"))
				.andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("ACCOUNT_VERIFICATION_FAILED"));
		when(authService.profile("user-123")).thenReturn(publicUser());
		mockMvc.perform(get("/api/usuarios/me").header("Authorization", "Bearer " + token))
				.andExpect(status().isOk());
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
