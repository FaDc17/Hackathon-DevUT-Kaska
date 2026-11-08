package com.kuska.api.security;

import java.io.IOException;
import java.util.List;

import com.kuska.api.user.UsuarioRepository;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;
	private final UsuarioRepository usuarios;

	public JwtAuthenticationFilter(JwtService jwtService, UsuarioRepository usuarios) {
		this.jwtService = jwtService;
		this.usuarios = usuarios;
	}

	@Override
	protected void doFilterInternal(
			HttpServletRequest request,
			HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (authorization != null && authorization.startsWith("Bearer ")) {
			String token = authorization.substring(7).trim();
			if (!token.isEmpty()) {
				try {
					AuthenticatedUser user = jwtService.parse(token);
					if (usuarios.existsByIdAndEstadoTrueAndEliminadoFalse(user.id())) {
						var authentication = new UsernamePasswordAuthenticationToken(
								user, null, List.of());
						SecurityContextHolder.getContext().setAuthentication(authentication);
					}
				} catch (JwtException | IllegalArgumentException exception) {
					SecurityContextHolder.clearContext();
				}
			}
		}
		filterChain.doFilter(request, response);
	}
}
