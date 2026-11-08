package com.kuska.api.user;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.UUID;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kuska.api.catalog.Departamento;
import com.kuska.api.catalog.Distrito;
import com.kuska.api.catalog.DistritoRepository;
import com.kuska.api.catalog.ResourceNotFoundException;
import com.kuska.api.security.JwtService;

@Service
public class AuthService {

	private final UsuarioRepository usuarios;
	private final DistritoRepository distritos;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;

	public AuthService(
			UsuarioRepository usuarios,
			DistritoRepository distritos,
			PasswordEncoder passwordEncoder,
			JwtService jwtService) {
		this.usuarios = usuarios;
		this.distritos = distritos;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
	}

	@Transactional
	public UserDtos.AuthResponse register(UserDtos.RegisterRequest request) {
		RegistrationValidation.password(request.password());
		// Older clients do not send confirmation; when supplied it must match exactly.
		if (request.confirmPassword() != null && !request.password().equals(request.confirmPassword()))
			throw new IllegalArgumentException("Las contraseñas no coinciden.");
		String phone = RegistrationValidation.phone(request.phone());
		if (usuarios.existsByNombreUsuarioIgnoreCase(request.username().trim())
				|| usuarios.existsByCelular(phone)) {
			throw new DuplicateUserException();
		}

		Distrito distrito = distritos.findById(request.districtId())
				.orElseThrow(() -> new ResourceNotFoundException(
						"El distrito indicado no existe."));
		Usuario usuario = new Usuario();
		usuario.setId(UUID.randomUUID().toString());
		usuario.setNombreUsuario(request.username().trim());
		usuario.setContrasenaHash(passwordEncoder.encode(request.password()));
		usuario.setCelular(phone);
		usuario.setDireccionPrivada(request.address().trim());
		usuario.setDistrito(distrito);
		usuario.setDescripcionPerfil(normalizeAbout(request.about()));
		usuario.setEstado(true);
		usuario.setEliminado(false);

		Usuario saved = usuarios.save(usuario);
		return createAuthResponse(saved);
	}

	@Transactional(readOnly = true)
	public UserDtos.AuthResponse login(UserDtos.LoginRequest request) {
		Usuario usuario = usuarios
				.findByNombreUsuarioIgnoreCaseAndEstadoTrueAndEliminadoFalse(request.username().trim())
				.orElseThrow(() -> new BadCredentialsException("Credenciales incorrectas."));
		if (!passwordEncoder.matches(request.password(), usuario.getContrasenaHash())) {
			throw new BadCredentialsException("Credenciales incorrectas.");
		}
		return createAuthResponse(usuario);
	}

	@Transactional(readOnly = true)
	public UserDtos.PublicUser profile(String userId) {
		return toPublicUser(findActiveUser(userId));
	}

	@Transactional(readOnly = true)
	public UserDtos.AuthResponse renew(String userId, String token) {
		Usuario usuario = findActiveUser(userId);
		try {
			String renewed = jwtService.renewAccessToken(token,
				new JwtService.UsuarioTokenSubject(usuario.getId(), usuario.getNombreUsuario()));
			return new UserDtos.AuthResponse(renewed, "Bearer", jwtService.getExpirationSeconds(), toPublicUser(usuario));
		} catch (IllegalArgumentException failure) {
			throw new BadCredentialsException("La sesión venció. Inicia sesión nuevamente.");
		}
	}

	@Transactional(readOnly = true)
	public UserDtos.NeighborProfile neighborProfile(String userId) {
		UserDtos.PublicUser user = toPublicUser(findActiveUser(userId));
		return new UserDtos.NeighborProfile(user.id(), user.username(), user.districtId(),
				user.district(), user.province(), user.departmentId(), user.department(), user.about());
	}

	@Transactional
	public void deleteAccount(String userId, UserDtos.AccountDeletionRequest request) {
		Usuario usuario = findActiveUser(userId);
		if (!"ELIMINAR".equals(request.confirmation())) {
			throw new IllegalArgumentException("Escribe ELIMINAR para confirmar la eliminación de tu cuenta.");
		}
		if (!passwordEncoder.matches(request.password(), usuario.getContrasenaHash())) {
			throw new AccountVerificationException();
		}
		// Keep foreign keys and original identifiers. All changes commit together.
		usuarios.softDeleteOwnedServiceImages(userId);
		usuarios.softDeleteOwnedPostImages(userId);
		usuarios.softDeleteOwnedEmergencies(userId);
		usuarios.softDeleteRelatedReviews(userId);
		usuarios.softDeleteRelatedReplies(userId);
		usuarios.softDeleteRelatedFavorites(userId);
		usuarios.softDeleteOwnedServices(userId);
		usuarios.softDeleteOwnedPosts(userId);
		usuario.setEstado(false);
		usuario.setEliminado(true);
		usuarios.saveAndFlush(usuario);
	}

	@Transactional
	public UserDtos.PublicUser updateProfile(String userId, UserDtos.ProfileUpdateRequest request) {
		Usuario usuario = findActiveUser(userId);
		String phone = RegistrationValidation.phone(request.phone());
		if (usuarios.existsByNombreUsuarioIgnoreCaseAndIdNot(request.username().trim(), userId)
				|| usuarios.existsByCelularAndIdNot(phone, userId)) {
			throw new DuplicateUserException();
		}
		Distrito distrito = distritos.findById(request.districtId())
				.orElseThrow(() -> new ResourceNotFoundException(
						"El distrito indicado no existe."));

		usuario.setNombreUsuario(request.username().trim());
		usuario.setCelular(phone);
		usuario.setDireccionPrivada(request.address().trim());
		usuario.setDistrito(distrito);
		usuario.setDescripcionPerfil(normalizeAbout(request.about()));
		return toPublicUser(usuarios.save(usuario));
	}

	private UserDtos.AuthResponse createAuthResponse(Usuario usuario) {
		String token = jwtService.createAccessToken(
				new JwtService.UsuarioTokenSubject(usuario.getId(), usuario.getNombreUsuario()));
		return new UserDtos.AuthResponse(token, "Bearer", jwtService.getExpirationSeconds(),
				toPublicUser(usuario));
	}

	private UserDtos.PublicUser toPublicUser(Usuario usuario) {
		Distrito distrito = usuario.getDistrito();
		Departamento departamento = distrito.getDepartamento();
		return new UserDtos.PublicUser(
				usuario.getId(),
				usuario.getNombreUsuario(),
				usuario.getCelular(),
				usuario.getDireccionPrivada(),
				distrito.getId(),
				distrito.getNombre(),
				distrito.getProvincia(),
				departamento.getId(),
				departamento.getNombre(),
				usuario.getDescripcionPerfil());
	}

	private Usuario findActiveUser(String userId) {
		return usuarios.findByIdAndEstadoTrueAndEliminadoFalse(userId)
				.orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado."));
	}

	@Transactional
	public void changePassword(String userId, UserDtos.PasswordChangeRequest request) {
		Usuario usuario = findActiveUser(userId);
		if (!passwordEncoder.matches(request.currentPassword(), usuario.getContrasenaHash()))
			throw new AccountVerificationException();
		RegistrationValidation.password(request.newPassword());
		if (!request.newPassword().equals(request.confirmPassword()))
			throw new IllegalArgumentException("Las contraseñas no coinciden.");
		usuario.setContrasenaHash(passwordEncoder.encode(request.newPassword()));
		usuarios.saveAndFlush(usuario);
	}

	private String normalizeAbout(String about) {
		return about == null || about.isBlank() ? null : about.trim();
	}
}
