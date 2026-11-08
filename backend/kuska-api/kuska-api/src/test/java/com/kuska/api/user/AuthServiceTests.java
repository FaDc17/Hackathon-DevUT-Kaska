package com.kuska.api.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.kuska.api.catalog.Departamento;
import com.kuska.api.catalog.Distrito;
import com.kuska.api.catalog.DistritoRepository;
import com.kuska.api.security.JwtService;

@ExtendWith(MockitoExtension.class)
class AuthServiceTests {

	private static final String JWT_SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

	@Mock
	private UsuarioRepository usuarios;

	@Mock
	private DistritoRepository distritos;

	private BCryptPasswordEncoder passwordEncoder;
	private JwtService jwtService;
	private AuthService authService;

	@BeforeEach
	void setUp() {
		passwordEncoder = new BCryptPasswordEncoder(4);
		jwtService = new JwtService(JWT_SECRET, 900_000);
		authService = new AuthService(usuarios, distritos, passwordEncoder, jwtService);
	}

	@Test
	void registerHashesPasswordAndReturnsOnlyPublicFields() {
		Distrito distrito = mock(Distrito.class);
		Departamento departamento = mock(Departamento.class);
		when(distritos.findById(12)).thenReturn(Optional.of(distrito));
		when(distrito.getId()).thenReturn(12);
		when(distrito.getNombre()).thenReturn("Pueblo Libre");
		when(distrito.getProvincia()).thenReturn("Lima");
		when(distrito.getDepartamento()).thenReturn(departamento);
		when(departamento.getId()).thenReturn(15);
		when(departamento.getNombre()).thenReturn("Lima");
		when(usuarios.save(any(Usuario.class))).thenAnswer(invocation -> invocation.getArgument(0));

		UserDtos.AuthResponse response = authService.register(new UserDtos.RegisterRequest(
				"kuska_user", "Secure123!", "987654321", "Av. Comunidad 123", 12, "Vecino"));

		ArgumentCaptor<Usuario> saved = ArgumentCaptor.forClass(Usuario.class);
		verify(usuarios).save(saved.capture());
		assertTrue(passwordEncoder.matches("Secure123!", saved.getValue().getContrasenaHash()));
		assertFalse(response.accessToken().isBlank());
		assertEquals("kuska_user", response.user().username());
		assertFalse(response.user().toString().contains(saved.getValue().getContrasenaHash()));
	}

	@Test
	void registrationRejectsDuplicateUsernameOrPhone() {
		when(usuarios.existsByNombreUsuarioIgnoreCase("kuska_user")).thenReturn(true);

		assertThrows(DuplicateUserException.class, () -> authService.register(
				new UserDtos.RegisterRequest(
						"kuska_user", "Secure123!", "987654321", "Av. Comunidad 123", 12, null)));
		verify(distritos, never()).findById(any());
	}

	@Test
	void loginRejectsIncorrectPasswordWithoutRevealingAccountState() {
		Usuario user = mock(Usuario.class);
		when(usuarios.findByNombreUsuarioIgnoreCaseAndEstadoTrueAndEliminadoFalse("kuska_user"))
				.thenReturn(Optional.of(user));
		when(user.getContrasenaHash()).thenReturn(passwordEncoder.encode("Secure123!"));

		BadCredentialsException error = assertThrows(BadCredentialsException.class,
				() -> authService.login(new UserDtos.LoginRequest("kuska_user", "wrongpass1")));
		assertEquals("Credenciales incorrectas.", error.getMessage());
	}

	@Test
	void loginCreatesAccessTokenForCorrectPassword() {
		Usuario user = mock(Usuario.class);
		Distrito distrito = mock(Distrito.class);
		Departamento departamento = mock(Departamento.class);
		when(usuarios.findByNombreUsuarioIgnoreCaseAndEstadoTrueAndEliminadoFalse("kuska_user"))
				.thenReturn(Optional.of(user));
		when(user.getContrasenaHash()).thenReturn(passwordEncoder.encode("Secure123!"));
		when(user.getId()).thenReturn("user-123");
		when(user.getNombreUsuario()).thenReturn("kuska_user");
		when(user.getDistrito()).thenReturn(distrito);
		when(distrito.getId()).thenReturn(12);
		when(distrito.getNombre()).thenReturn("Pueblo Libre");
		when(distrito.getProvincia()).thenReturn("Lima");
		when(distrito.getDepartamento()).thenReturn(departamento);
		when(departamento.getId()).thenReturn(15);
		when(departamento.getNombre()).thenReturn("Lima");

		UserDtos.AuthResponse response = authService.login(
				new UserDtos.LoginRequest("kuska_user", "Secure123!"));

		assertEquals(900, response.expiresIn());
		assertEquals("user-123", jwtService.parse(response.accessToken()).id());
	}

	@Test
	void deletesOnlyAuthenticatedAccountAfterPasswordAndExplicitConfirmation() {
		Usuario user = new Usuario();
		user.setId("user-123");
		user.setEstado(true);
		user.setContrasenaHash(passwordEncoder.encode("Secure123!"));
		when(usuarios.findByIdAndEstadoTrueAndEliminadoFalse("user-123"))
				.thenReturn(Optional.of(user));

		authService.deleteAccount("user-123", new UserDtos.AccountDeletionRequest("Secure123!", "ELIMINAR"));

		assertFalse(user.isEstado());
		assertTrue(user.isEliminado());
		verify(usuarios).softDeleteOwnedServices("user-123");
		verify(usuarios).softDeleteOwnedPosts("user-123");
		verify(usuarios).softDeleteOwnedServiceImages("user-123");
		verify(usuarios).softDeleteOwnedPostImages("user-123");
		verify(usuarios).softDeleteOwnedEmergencies("user-123");
		verify(usuarios).softDeleteRelatedFavorites("user-123");
		verify(usuarios).softDeleteRelatedReplies("user-123");
		verify(usuarios).softDeleteRelatedReviews("user-123");
		verify(usuarios).saveAndFlush(user);
	}

	@Test
	void deletionRejectsWrongPasswordWithoutChangingData() {
		Usuario user = new Usuario();
		user.setEstado(true);
		user.setContrasenaHash(passwordEncoder.encode("Secure123!"));
		when(usuarios.findByIdAndEstadoTrueAndEliminadoFalse("user-123"))
				.thenReturn(Optional.of(user));

		assertThrows(AccountVerificationException.class, () -> authService.deleteAccount("user-123",
				new UserDtos.AccountDeletionRequest("incorrect1", "ELIMINAR")));
		assertTrue(user.isEstado());
		assertFalse(user.isEliminado());
		verify(usuarios, never()).softDeleteOwnedServices(any());
		verify(usuarios, never()).saveAndFlush(any());
	}

	@Test
	void deletionRejectsMissingConfirmationWithoutChangingData() {
		Usuario user = new Usuario();
		when(usuarios.findByIdAndEstadoTrueAndEliminadoFalse("user-123"))
				.thenReturn(Optional.of(user));
		assertThrows(IllegalArgumentException.class, () -> authService.deleteAccount("user-123",
				new UserDtos.AccountDeletionRequest("Secure123!", "SI")));
		verify(usuarios, never()).saveAndFlush(any());
	}
}
