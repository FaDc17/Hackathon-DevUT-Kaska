package com.kuska.api.user;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UsuarioRepository extends JpaRepository<Usuario, String> {

	Optional<Usuario> findByNombreUsuarioIgnoreCaseAndEstadoTrueAndEliminadoFalse(String nombreUsuario);

	Optional<Usuario> findByIdAndEstadoTrueAndEliminadoFalse(String id);

	boolean existsByNombreUsuarioIgnoreCase(String nombreUsuario);

	boolean existsByCelular(String celular);

	boolean existsByNombreUsuarioIgnoreCaseAndIdNot(String nombreUsuario, String id);

	boolean existsByCelularAndIdNot(String celular, String id);
}
