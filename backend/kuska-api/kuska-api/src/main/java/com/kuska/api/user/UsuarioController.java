package com.kuska.api.user;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.kuska.api.security.AuthenticatedUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/usuarios/me")
@Validated
public class UsuarioController {

	private final AuthService authService;

	public UsuarioController(AuthService authService) {
		this.authService = authService;
	}

	@GetMapping
	public UserDtos.PublicUser profile(@AuthenticationPrincipal AuthenticatedUser user) {
		return authService.profile(user.id());
	}

	@PutMapping
	public UserDtos.PublicUser updateProfile(
			@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody UserDtos.ProfileUpdateRequest request) {
		return authService.updateProfile(user.id(), request);
	}
}
