package com.kuska.api.user;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@Validated
public class AuthController {

	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	@PostMapping("/register")
	public ResponseEntity<UserDtos.AuthResponse> register(
			@Valid @RequestBody UserDtos.RegisterRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
	}

	@PostMapping("/login")
	public UserDtos.AuthResponse login(@Valid @RequestBody UserDtos.LoginRequest request) {
		return authService.login(request);
	}

	@PostMapping("/logout")
	public ResponseEntity<Void> logout() {
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/refresh")
	public UserDtos.AuthResponse refresh(
			@org.springframework.security.core.annotation.AuthenticationPrincipal com.kuska.api.security.AuthenticatedUser user,
			@org.springframework.web.bind.annotation.RequestHeader("Authorization") String authorization) {
		return authService.renew(user.id(), authorization.substring(7).trim());
	}
}
