package com.kuska.api.user;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PublicProfileController {
	private final AuthService auth;

	public PublicProfileController(AuthService auth) {
		this.auth = auth;
	}

	@GetMapping("/api/usuarios/{id}/publico")
	public UserDtos.NeighborProfile profile(@PathVariable String id) {
		return auth.neighborProfile(id);
	}
}
