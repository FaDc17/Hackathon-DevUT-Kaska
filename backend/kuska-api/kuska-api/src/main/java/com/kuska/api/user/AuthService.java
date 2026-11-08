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
		validatePassword(request.password());
		if (usuarios.existsByNombreUsuarioIgnoreCase(request.username())
				|| usuarios.existsByCelular(request.phone())) {
			throw new DuplicateUserException();
		}

		Distrito distrito = distritos.findById(request.districtId())
				.orElseThrow(() -> new ResourceNotFoundException(
						"El distrito indicado no existe."));
		Usuario usuario = new Usuario();
		usuario.setId(UUID.randomUUID().toString());
		usuario.setNombreUsuario(request.username().trim());
		usuario.setContrasenaHash(passwordEncoder.encode(request.password()));
		usuario.setCelular(request.phone());
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

	@Transactional
	public UserDtos.PublicUser updateProfile(String userId, UserDtos.ProfileUpdateRequest request) {
		Usuario usuario = findActiveUser(userId);
		if (usuarios.existsByNombreUsuarioIgnoreCaseAndIdNot(request.username().trim(), userId)
				|| usuarios.existsByCelularAndIdNot(request.phone(), userId)) {
			throw new DuplicateUserException();
		}
		Distrito distrito = distritos.findById(request.districtId())
				.orElseThrow(() -> new ResourceNotFoundException(
						"El distrito indicado no existe."));

		usuario.setNombreUsuario(request.username().trim());
		usuario.setCelular(request.phone());
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

	private void validatePassword(String password) {
		if (password.getBytes(StandardCharsets.UTF_8).length > 72
				|| password.chars().noneMatch(Character::isLetter)
				|| password.chars().noneMatch(Character::isDigit)) {
			throw new IllegalArgumentException(
					"La contraseña debe tener entre 8 y 72 bytes e incluir letras y números.");
		}
	}

	private String normalizeAbout(String about) {
		return about == null || about.isBlank() ? null : about.trim();
	}
}
