package com.kuska.api.user;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UsuarioRepository extends JpaRepository<Usuario, String> {

	Optional<Usuario> findByNombreUsuarioIgnoreCaseAndEstadoTrueAndEliminadoFalse(String nombreUsuario);

	Optional<Usuario> findByIdAndEstadoTrueAndEliminadoFalse(String id);

	boolean existsByNombreUsuarioIgnoreCase(String nombreUsuario);

	boolean existsByCelular(String celular);

	boolean existsByNombreUsuarioIgnoreCaseAndIdNot(String nombreUsuario, String id);

	boolean existsByCelularAndIdNot(String celular, String id);

	boolean existsByIdAndEstadoTrueAndEliminadoFalse(String id);

	@Modifying
	@Query(value = "UPDATE dbo.ImagenesServicio SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdServicio IN (SELECT IdServicio FROM dbo.Servicios WHERE IdUsuario = :id)", nativeQuery = true)
	void softDeleteOwnedServiceImages(@Param("id") String id);

	@Modifying
	@Query(value = "UPDATE dbo.ImagenesPublicacion SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdPublicacion IN (SELECT IdPublicacion FROM dbo.Publicaciones WHERE IdUsuario = :id)", nativeQuery = true)
	void softDeleteOwnedPostImages(@Param("id") String id);

	@Modifying
	@Query(value = "UPDATE dbo.Emergencias SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdPublicacion IN (SELECT IdPublicacion FROM dbo.Publicaciones WHERE IdUsuario = :id)", nativeQuery = true)
	void softDeleteOwnedEmergencies(@Param("id") String id);

	@Modifying
	@Query(value = "UPDATE dbo.ResenasServicio SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdUsuario = :id OR IdServicio IN (SELECT IdServicio FROM dbo.Servicios WHERE IdUsuario = :id)", nativeQuery = true)
	void softDeleteRelatedReviews(@Param("id") String id);

	@Modifying
	@Query(value = "UPDATE dbo.RespuestasPublicacion SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdUsuario = :id OR IdPublicacion IN (SELECT IdPublicacion FROM dbo.Publicaciones WHERE IdUsuario = :id)", nativeQuery = true)
	void softDeleteRelatedReplies(@Param("id") String id);

	@Modifying
	@Query(value = "UPDATE dbo.ServiciosFavoritos SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdUsuario = :id OR IdServicio IN (SELECT IdServicio FROM dbo.Servicios WHERE IdUsuario = :id)", nativeQuery = true)
	void softDeleteRelatedFavorites(@Param("id") String id);

	@Modifying
	@Query(value = "UPDATE dbo.Servicios SET Estado = 0, Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdUsuario = :id", nativeQuery = true)
	void softDeleteOwnedServices(@Param("id") String id);

	@Modifying
	@Query(value = "UPDATE dbo.Publicaciones SET Estado = 0, Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE IdUsuario = :id", nativeQuery = true)
	void softDeleteOwnedPosts(@Param("id") String id);
}
