package com.kuska.api.content;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.context.annotation.Profile;

import com.kuska.api.content.ContentDtos.EmergencyView;
import com.kuska.api.content.ContentDtos.ImageRequest;
import com.kuska.api.content.ContentDtos.ImageView;
import com.kuska.api.content.ContentDtos.PostRequest;
import com.kuska.api.content.ContentDtos.PostView;
import com.kuska.api.content.ContentDtos.ReplyRequest;
import com.kuska.api.content.ContentDtos.ReplyView;
import com.kuska.api.content.ContentDtos.ReviewRequest;
import com.kuska.api.content.ContentDtos.ReviewView;
import com.kuska.api.content.ContentDtos.ServiceRequest;
import com.kuska.api.content.ContentDtos.ServiceView;
import com.kuska.api.catalog.ResourceNotFoundException;

@Repository
@Profile("!test")
public class ContentRepository {

	private final JdbcTemplate jdbc;

	public ContentRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public List<ServiceView> listServices() {
		return jdbc.query(serviceSql() + """
				WHERE s.Estado = 1 AND s.Eliminado = 0
				ORDER BY s.FechaPublicacion DESC
				""", SERVICE_BASE_MAPPER).stream().map(this::attachServiceDetails).toList();
	}

	public ServiceView service(String id) {
		return jdbc.query(serviceSql() + "WHERE s.IdServicio = ? AND s.Eliminado = 0",
				SERVICE_BASE_MAPPER, id).stream().findFirst()
				.map(this::attachServiceDetails)
				.orElseThrow(() -> new ResourceNotFoundException("Servicio no encontrado."));
	}

	public boolean serviceExists(String id) {
		return Boolean.TRUE.equals(jdbc.queryForObject(
				"SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Servicios WHERE IdServicio = ?) THEN 1 ELSE 0 END",
				Boolean.class, id));
	}

	public String serviceOwner(String id) {
		return jdbc.query("SELECT IdUsuario FROM dbo.Servicios WHERE IdServicio = ? AND Eliminado = 0",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Servicio no encontrado."));
	}

	public String serviceOwnerIncludingDeleted(String id) {
		return jdbc.query("SELECT IdUsuario FROM dbo.Servicios WHERE IdServicio = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Servicio no encontrado."));
	}

	public void insertService(String ownerId, ServiceRequest request) {
		jdbc.update("""
				INSERT INTO dbo.Servicios
					(IdServicio, IdUsuario, IdCategoria, Titulo, Descripcion, PrecioMinimo, PrecioMaximo,
					 UbicacionAproximada, Latitud, Longitud, RadioCoberturaMetros)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				""",
				request.id(), ownerId, request.categoryId(), request.title().trim(),
				request.description().trim(), request.priceMin(), request.priceMax(),
				trimToNull(request.location()), request.latitude(), request.longitude(),
				request.coverageRadiusMeters());
	}

	public void updateService(String id, ServiceRequest request) {
		jdbc.update("""
				UPDATE dbo.Servicios
				SET IdCategoria = ?, Titulo = ?, Descripcion = ?, PrecioMinimo = ?, PrecioMaximo = ?,
					UbicacionAproximada = ?, Latitud = ?, Longitud = ?, RadioCoberturaMetros = ?,
					FechaActualizacion = SYSUTCDATETIME()
				WHERE IdServicio = ? AND Eliminado = 0
				""",
				request.categoryId(), request.title().trim(), request.description().trim(),
				request.priceMin(), request.priceMax(), trimToNull(request.location()),
				request.latitude(), request.longitude(), request.coverageRadiusMeters(), id);
	}

	public void softDeleteService(String id) {
		jdbc.update("""
				UPDATE dbo.Servicios
				SET Eliminado = 1, Estado = 0, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdServicio = ? AND Eliminado = 0
				""", id);
	}

	public List<ImageView> serviceImages(String serviceId) {
		return jdbc.query("""
				SELECT IdImagen, UrlRemota, Orden, FechaActualizacion
				FROM dbo.ImagenesServicio
				WHERE IdServicio = ? AND Eliminado = 0
				ORDER BY Orden, IdImagen
				""", IMAGE_MAPPER, serviceId);
	}

	public Optional<ImageView> serviceImage(String id) {
		return jdbc.query("""
				SELECT IdImagen, UrlRemota, Orden, FechaActualizacion
				FROM dbo.ImagenesServicio
				WHERE IdImagen = ? AND Eliminado = 0
				""", IMAGE_MAPPER, id).stream().findFirst();
	}

	public boolean serviceImageExists(String id) {
		return jdbc.query("SELECT IdServicio FROM dbo.ImagenesServicio WHERE IdImagen = ?",
				(rs, row) -> rs.getString(1), id).size() > 0;
	}

	public String serviceImageOwner(String imageId) {
		return jdbc.query("""
				SELECT s.IdUsuario
				FROM dbo.ImagenesServicio i
				JOIN dbo.Servicios s ON s.IdServicio = i.IdServicio
				WHERE i.IdImagen = ?
				""", (rs, row) -> rs.getString(1), imageId).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Imagen de servicio no encontrada."));
	}

	public String serviceImageParent(String id) {
		return jdbc.query("SELECT IdServicio FROM dbo.ImagenesServicio WHERE IdImagen = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Imagen de servicio no encontrada."));
	}

	public void insertServiceImage(String serviceId, ImageRequest image) {
		jdbc.update("""
				INSERT INTO dbo.ImagenesServicio (IdImagen, IdServicio, UrlRemota, Orden)
				VALUES (?, ?, ?, ?)
				""", image.id(), serviceId, image.url().trim(), image.order());
	}

	public void softDeleteServiceImage(String id) {
		jdbc.update("""
				UPDATE dbo.ImagenesServicio
				SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdImagen = ? AND Eliminado = 0
				""", id);
	}

	public void updateServiceImage(String id, ImageRequest image) {
				jdbc.update("""
						UPDATE dbo.ImagenesServicio
						SET UrlRemota = ?, Orden = ?, Eliminado = 0, FechaActualizacion = SYSUTCDATETIME()
						WHERE IdImagen = ?
						""", image.url().trim(), image.order(), id);
	}

	public List<ReviewView> reviews(String serviceId) {
		return jdbc.query("""
				SELECT r.IdResena, r.IdServicio, r.IdUsuario, u.NombreUsuario,
					   r.Calificacion, r.Comentario, r.FechaResena
				FROM dbo.ResenasServicio r
				JOIN dbo.Usuarios u ON u.IdUsuario = r.IdUsuario
				WHERE r.IdServicio = ? AND r.Eliminado = 0
				ORDER BY r.FechaResena DESC
				""", REVIEW_MAPPER, serviceId);
	}

	public Optional<ReviewView> review(String id) {
		return jdbc.query("""
				SELECT r.IdResena, r.IdServicio, r.IdUsuario, u.NombreUsuario,
					   r.Calificacion, r.Comentario, r.FechaResena
				FROM dbo.ResenasServicio r
				JOIN dbo.Usuarios u ON u.IdUsuario = r.IdUsuario
				WHERE r.IdResena = ? AND r.Eliminado = 0
				""", REVIEW_MAPPER, id).stream().findFirst();
	}

	public String reviewOwner(String reviewId) {
		return jdbc.query("SELECT IdUsuario FROM dbo.ResenasServicio WHERE IdResena = ?",
				(rs, row) -> rs.getString(1), reviewId).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Reseña no encontrada."));
	}

	public boolean reviewExists(String reviewId) {
		return jdbc.query("SELECT IdResena FROM dbo.ResenasServicio WHERE IdResena = ?",
				(rs, row) -> rs.getString(1), reviewId).size() > 0;
	}

	public Optional<String> reviewIdFor(String serviceId, String userId) {
		return jdbc.query("""
				SELECT IdResena FROM dbo.ResenasServicio
				WHERE IdServicio = ? AND IdUsuario = ?
				""", (rs, row) -> rs.getString(1), serviceId, userId).stream().findFirst();
	}

	public void insertReview(String id, String serviceId, String userId, ReviewRequest request) {
		jdbc.update("""
				INSERT INTO dbo.ResenasServicio
					(IdResena, IdServicio, IdUsuario, Calificacion, Comentario)
				VALUES (?, ?, ?, ?, ?)
				""", id, serviceId, userId, request.rating(), trimToNull(request.comment()));
	}

	public void updateReview(String id, ReviewRequest request) {
		jdbc.update("""
				UPDATE dbo.ResenasServicio
				SET Calificacion = ?, Comentario = ?, FechaActualizacion = SYSUTCDATETIME(),
					Eliminado = 0
				WHERE IdResena = ?
				""", request.rating(), trimToNull(request.comment()), id);
	}

	public void softDeleteReview(String id) {
		jdbc.update("""
				UPDATE dbo.ResenasServicio
				SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdResena = ? AND Eliminado = 0
				""", id);
	}

	public List<PostView> listPosts() {
		List<PostView> posts = jdbc.query(postSql() + """
				WHERE p.Estado = 1 AND p.Eliminado = 0
				ORDER BY p.FechaPublicacion DESC
				""", (rs, row) -> postView(rs));
		return posts.stream().map(this::attachPostDetails).toList();
	}

	public PostView post(String id) {
		PostView post = jdbc.query(postSql() + "WHERE p.IdPublicacion = ? AND p.Eliminado = 0",
				(rs, row) -> postView(rs), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Publicación no encontrada."));
		return attachPostDetails(post);
	}

	public boolean postExists(String id) {
		return Boolean.TRUE.equals(jdbc.queryForObject(
				"SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Publicaciones WHERE IdPublicacion = ?) THEN 1 ELSE 0 END",
				Boolean.class, id));
	}

	public String postOwner(String id) {
		return jdbc.query("SELECT IdUsuario FROM dbo.Publicaciones WHERE IdPublicacion = ? AND Eliminado = 0",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Publicación no encontrada."));
	}

	public String postOwnerIncludingDeleted(String id) {
		return jdbc.query("SELECT IdUsuario FROM dbo.Publicaciones WHERE IdPublicacion = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Publicación no encontrada."));
	}

	public Integer postTypeId(String id) {
		return jdbc.query("SELECT IdTipoPublicacion FROM dbo.Publicaciones WHERE IdPublicacion = ?",
				(rs, row) -> rs.getInt(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Publicación no encontrada."));
	}

	public void insertPost(String ownerId, PostRequest request) {
		jdbc.update("""
				INSERT INTO dbo.Publicaciones
					(IdPublicacion, IdUsuario, IdTipoPublicacion, Titulo, Descripcion,
					 UbicacionAproximada, Latitud, Longitud, RadioAproximadoMetros)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				""", request.id(), ownerId, request.typeId(), request.title().trim(),
				request.description().trim(), trimToNull(request.location()), request.latitude(),
				request.longitude(), request.approximateRadiusMeters());
	}

	public void updatePost(String id, PostRequest request) {
		jdbc.update("""
				UPDATE dbo.Publicaciones
				SET IdTipoPublicacion = ?, Titulo = ?, Descripcion = ?, UbicacionAproximada = ?,
					Latitud = ?, Longitud = ?, RadioAproximadoMetros = ?,
					FechaActualizacion = SYSUTCDATETIME()
				WHERE IdPublicacion = ? AND Eliminado = 0
				""", request.typeId(), request.title().trim(), request.description().trim(),
				trimToNull(request.location()), request.latitude(), request.longitude(),
				request.approximateRadiusMeters(), id);
	}

	public void softDeletePost(String id) {
		jdbc.update("""
				UPDATE dbo.Publicaciones
				SET Eliminado = 1, Estado = 0, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdPublicacion = ? AND Eliminado = 0
				""", id);
	}

	public List<ImageView> postImages(String postId) {
		return jdbc.query("""
				SELECT IdImagen, UrlRemota, Orden, FechaActualizacion
				FROM dbo.ImagenesPublicacion
				WHERE IdPublicacion = ? AND Eliminado = 0
				ORDER BY Orden, IdImagen
				""", IMAGE_MAPPER, postId);
	}

	public Optional<ImageView> postImage(String id) {
		return jdbc.query("""
				SELECT IdImagen, UrlRemota, Orden, FechaActualizacion
				FROM dbo.ImagenesPublicacion
				WHERE IdImagen = ? AND Eliminado = 0
				""", IMAGE_MAPPER, id).stream().findFirst();
	}

	public boolean postImageExists(String id) {
		return jdbc.query("SELECT IdPublicacion FROM dbo.ImagenesPublicacion WHERE IdImagen = ?",
				(rs, row) -> rs.getString(1), id).size() > 0;
	}

	public String postImageOwner(String id) {
		return jdbc.query("""
				SELECT p.IdUsuario
				FROM dbo.ImagenesPublicacion i
				JOIN dbo.Publicaciones p ON p.IdPublicacion = i.IdPublicacion
				WHERE i.IdImagen = ?
				""", (rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Imagen de publicación no encontrada."));
	}

	public String postImageParent(String id) {
		return jdbc.query("SELECT IdPublicacion FROM dbo.ImagenesPublicacion WHERE IdImagen = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Imagen de publicación no encontrada."));
	}

	public void insertPostImage(String postId, ImageRequest image) {
		jdbc.update("""
				INSERT INTO dbo.ImagenesPublicacion (IdImagen, IdPublicacion, UrlRemota, Orden)
				VALUES (?, ?, ?, ?)
				""", image.id(), postId, image.url().trim(), image.order());
	}

	public void softDeletePostImage(String id) {
		jdbc.update("""
				UPDATE dbo.ImagenesPublicacion
				SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdImagen = ? AND Eliminado = 0
				""", id);
	}

	public void updatePostImage(String id, ImageRequest image) {
		jdbc.update("""
				UPDATE dbo.ImagenesPublicacion
				SET UrlRemota = ?, Orden = ?, Eliminado = 0, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdImagen = ?
				""", image.url().trim(), image.order(), id);
	}

	public List<ReplyView> replies(String postId) {
		return jdbc.query("""
				SELECT r.IdRespuesta, r.IdPublicacion, r.IdUsuario, u.NombreUsuario,
					   r.Mensaje, r.FechaRespuesta
				FROM dbo.RespuestasPublicacion r
				JOIN dbo.Usuarios u ON u.IdUsuario = r.IdUsuario
				WHERE r.IdPublicacion = ? AND r.Eliminado = 0
				ORDER BY r.FechaRespuesta
				""", REPLY_MAPPER, postId);
	}

	public Optional<ReplyView> reply(String id) {
		return jdbc.query("""
				SELECT r.IdRespuesta, r.IdPublicacion, r.IdUsuario, u.NombreUsuario,
					   r.Mensaje, r.FechaRespuesta
				FROM dbo.RespuestasPublicacion r
				JOIN dbo.Usuarios u ON u.IdUsuario = r.IdUsuario
				WHERE r.IdRespuesta = ? AND r.Eliminado = 0
				""", REPLY_MAPPER, id).stream().findFirst();
	}

	public boolean replyExists(String id) {
		return jdbc.query("SELECT IdUsuario FROM dbo.RespuestasPublicacion WHERE IdRespuesta = ?",
				(rs, row) -> rs.getString(1), id).size() > 0;
	}

	public String replyOwner(String id) {
		return jdbc.query("SELECT IdUsuario FROM dbo.RespuestasPublicacion WHERE IdRespuesta = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Respuesta no encontrada."));
	}

	public String replyParent(String id) {
		return jdbc.query("SELECT IdPublicacion FROM dbo.RespuestasPublicacion WHERE IdRespuesta = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Respuesta no encontrada."));
	}

	public void insertReply(String id, String postId, String userId, String message) {
		jdbc.update("""
				INSERT INTO dbo.RespuestasPublicacion (IdRespuesta, IdPublicacion, IdUsuario, Mensaje)
				VALUES (?, ?, ?, ?)
				""", id, postId, userId, message.trim());
	}

	public void updateReply(String id, String message) {
		jdbc.update("""
				UPDATE dbo.RespuestasPublicacion
				SET Mensaje = ?, FechaActualizacion = SYSUTCDATETIME(), Eliminado = 0
				WHERE IdRespuesta = ?
				""", message.trim(), id);
	}

	public void softDeleteReply(String id) {
		jdbc.update("""
				UPDATE dbo.RespuestasPublicacion
				SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdRespuesta = ? AND Eliminado = 0
				""", id);
	}

	public List<EmergencyView> listEmergencies() {
		return jdbc.query("""
				SELECT e.IdEmergencia, e.IdPublicacion, e.EstadoEmergencia, e.NivelPrioridad,
					   e.Seguimiento, e.FechaActualizacion
				FROM dbo.Emergencias e
				JOIN dbo.Publicaciones p ON p.IdPublicacion = e.IdPublicacion
				WHERE e.Eliminado = 0 AND p.Eliminado = 0
				ORDER BY e.FechaActualizacion DESC
				""", EMERGENCY_MAPPER);
	}

	public Optional<EmergencyView> emergency(String id) {
		return jdbc.query("""
				SELECT IdEmergencia, IdPublicacion, EstadoEmergencia, NivelPrioridad,
					   Seguimiento, FechaActualizacion
				FROM dbo.Emergencias
				WHERE IdEmergencia = ? AND Eliminado = 0
				""", EMERGENCY_MAPPER, id).stream().findFirst();
	}

	public Optional<EmergencyView> emergencyForPost(String postId) {
		return jdbc.query("""
				SELECT IdEmergencia, IdPublicacion, EstadoEmergencia, NivelPrioridad,
					   Seguimiento, FechaActualizacion
				FROM dbo.Emergencias
				WHERE IdPublicacion = ?
				""", EMERGENCY_MAPPER, postId).stream().findFirst();
	}

	public boolean emergencyExists(String id) {
		return jdbc.query("SELECT IdPublicacion FROM dbo.Emergencias WHERE IdEmergencia = ?",
				(rs, row) -> rs.getString(1), id).size() > 0;
	}

	public String emergencyOwner(String id) {
		return jdbc.query("""
				SELECT p.IdUsuario FROM dbo.Emergencias e
				JOIN dbo.Publicaciones p ON p.IdPublicacion = e.IdPublicacion
				WHERE e.IdEmergencia = ? AND e.Eliminado = 0 AND p.Eliminado = 0
				""", (rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Emergencia no encontrada."));
	}

	public String emergencyParent(String id) {
		return jdbc.query("SELECT IdPublicacion FROM dbo.Emergencias WHERE IdEmergencia = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Emergencia no encontrada."));
	}

	public void insertEmergency(String id, String postId, String status, String priority, String followUp) {
		jdbc.update("""
				INSERT INTO dbo.Emergencias
					(IdEmergencia, IdPublicacion, EstadoEmergencia, NivelPrioridad, Seguimiento)
				VALUES (?, ?, ?, ?, ?)
				""", id, postId, status, priority, trimToNull(followUp));
	}

	public void updateEmergency(String id, String status, String priority, String followUp) {
		jdbc.update("""
				UPDATE dbo.Emergencias
				SET EstadoEmergencia = ?, NivelPrioridad = ?, Seguimiento = ?,
					FechaActualizacion = SYSUTCDATETIME(), Eliminado = 0
				WHERE IdEmergencia = ?
				""", status, priority, trimToNull(followUp), id);
	}

	public void softDeleteEmergency(String id) {
		jdbc.update("""
				UPDATE dbo.Emergencias
				SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdEmergencia = ? AND Eliminado = 0
				""", id);
	}

	public boolean favoriteExists(String userId, String serviceId) {
		return Boolean.TRUE.equals(jdbc.queryForObject("""
				SELECT CASE WHEN EXISTS (
					SELECT 1 FROM dbo.ServiciosFavoritos
					WHERE IdUsuario = ? AND IdServicio = ? AND Eliminado = 0
				) THEN 1 ELSE 0 END
				""", Boolean.class, userId, serviceId));
	}

	public List<ServiceView> favoriteServices(String userId) {
		return jdbc.query(serviceSql() + """
				JOIN dbo.ServiciosFavoritos f ON f.IdServicio = s.IdServicio
				WHERE f.IdUsuario = ? AND f.Eliminado = 0
					AND s.Estado = 1 AND s.Eliminado = 0
				ORDER BY f.FechaGuardado DESC
				""", SERVICE_BASE_MAPPER, userId).stream().map(this::attachServiceDetails).toList();
	}

	public void insertFavorite(String userId, String serviceId) {
		int updated = jdbc.update("""
				UPDATE dbo.ServiciosFavoritos
				SET Eliminado = 0, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdUsuario = ? AND IdServicio = ? AND Eliminado = 1
				""", userId, serviceId);
		if (updated == 0 && !favoriteExists(userId, serviceId)) {
			jdbc.update("""
					INSERT INTO dbo.ServiciosFavoritos (IdUsuario, IdServicio)
					VALUES (?, ?)
					""", userId, serviceId);
		}
	}

	public void softDeleteFavorite(String userId, String serviceId) {
		jdbc.update("""
				UPDATE dbo.ServiciosFavoritos
				SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME()
				WHERE IdUsuario = ? AND IdServicio = ? AND Eliminado = 0
				""", userId, serviceId);
	}

	public boolean categoryExists(Integer id) {
		return exists("dbo.CategoriasServicio", "IdCategoria", id);
	}

	public boolean publicationTypeExists(Integer id) {
		return exists("dbo.TiposPublicacion", "IdTipoPublicacion", id);
	}

	public String publicationType(Integer id) {
		return jdbc.query("SELECT NombreTipo FROM dbo.TiposPublicacion WHERE IdTipoPublicacion = ?",
				(rs, row) -> rs.getString(1), id).stream().findFirst()
				.orElseThrow(() -> new ResourceNotFoundException("Tipo de publicación no encontrado."));
	}

	public boolean sameServiceImage(String id, String serviceId, String url, Integer order) {
		return jdbc.query("""
				SELECT IdImagen FROM dbo.ImagenesServicio
				WHERE IdImagen = ? AND IdServicio = ? AND UrlRemota = ? AND Orden = ?
				""", (rs, row) -> rs.getString(1), id, serviceId, url, order).size() > 0;
	}

	public boolean samePostImage(String id, String postId, String url, Integer order) {
		return jdbc.query("""
				SELECT IdImagen FROM dbo.ImagenesPublicacion
				WHERE IdImagen = ? AND IdPublicacion = ? AND UrlRemota = ? AND Orden = ?
				""", (rs, row) -> rs.getString(1), id, postId, url, order).size() > 0;
	}

	public boolean sameReply(String id, String postId, String userId, String message) {
		return jdbc.query("""
				SELECT IdRespuesta FROM dbo.RespuestasPublicacion
				WHERE IdRespuesta = ? AND IdPublicacion = ? AND IdUsuario = ? AND Mensaje = ?
				""", (rs, row) -> rs.getString(1), id, postId, userId, message).size() > 0;
	}

	public boolean sameEmergency(String id, String postId) {
		return jdbc.query("""
				SELECT IdEmergencia FROM dbo.Emergencias
				WHERE IdEmergencia = ? AND IdPublicacion = ?
				""", (rs, row) -> rs.getString(1), id, postId).size() > 0;
	}

	private boolean exists(String table, String column, Integer id) {
		return Boolean.TRUE.equals(jdbc.queryForObject(
				"SELECT CASE WHEN EXISTS (SELECT 1 FROM " + table + " WHERE " + column + " = ?) THEN 1 ELSE 0 END",
				Boolean.class, id));
	}

	private ServiceView attachServiceDetails(ServiceBase service) {
		return new ServiceView(service.id(), service.ownerId(), service.owner(), service.phone(),
				service.district(), service.categoryId(), service.category(), service.title(), service.description(),
				service.priceMin(), service.priceMax(), service.location(), service.latitude(),
				service.longitude(), service.coverageRadiusMeters(), service.publishedAt(),
				serviceImages(service.id()), reviews(service.id()), service.districtId());
	}

	private PostView postView(ResultSet rs) throws SQLException {
		return new PostView(rs.getString("IdPublicacion"), rs.getString("IdUsuario"),
				rs.getString("NombreUsuario"), rs.getString("NombreDistrito"),
				rs.getInt("IdTipoPublicacion"), rs.getString("NombreTipo"),
				rs.getString("Titulo"), rs.getString("Descripcion"), rs.getString("UbicacionAproximada"),
				nullableDouble(rs, "Latitud"), nullableDouble(rs, "Longitud"),
				nullableDouble(rs, "RadioAproximadoMetros"),
				rs.getTimestamp("FechaPublicacion").toLocalDateTime(), List.of(), List.of(), null,
				rs.getInt("IdDistrito"));
	}

	private PostView attachPostDetails(PostView post) {
		return new PostView(post.id(), post.ownerId(), post.owner(), post.district(),
				post.typeId(), post.type(),
				post.title(), post.description(), post.location(), post.latitude(), post.longitude(),
				post.approximateRadiusMeters(), post.publishedAt(), postImages(post.id()),
				replies(post.id()), emergencyForPost(post.id()).orElse(null), post.districtId());
	}

	private String serviceSql() {
		return """
				SELECT s.IdServicio, s.IdUsuario, u.NombreUsuario, u.Celular, u.IdDistrito, d.NombreDistrito,
					   s.IdCategoria,
					   c.NombreCategoria, s.Titulo, s.Descripcion, s.PrecioMinimo, s.PrecioMaximo,
					   s.UbicacionAproximada, s.Latitud, s.Longitud, s.RadioCoberturaMetros,
					   s.FechaPublicacion
				FROM dbo.Servicios s
				JOIN dbo.Usuarios u ON u.IdUsuario = s.IdUsuario AND u.Estado = 1 AND u.Eliminado = 0
				JOIN dbo.Distritos d ON d.IdDistrito = u.IdDistrito
				JOIN dbo.CategoriasServicio c ON c.IdCategoria = s.IdCategoria
				""";
	}

	private String postSql() {
		return """
				SELECT p.IdPublicacion, p.IdUsuario, u.NombreUsuario, u.IdDistrito, d.NombreDistrito,
					   p.IdTipoPublicacion,
					   t.NombreTipo, p.Titulo, p.Descripcion, p.UbicacionAproximada,
					   p.Latitud, p.Longitud, p.RadioAproximadoMetros, p.FechaPublicacion
				FROM dbo.Publicaciones p
				JOIN dbo.Usuarios u ON u.IdUsuario = p.IdUsuario AND u.Estado = 1 AND u.Eliminado = 0
				JOIN dbo.Distritos d ON d.IdDistrito = u.IdDistrito
				JOIN dbo.TiposPublicacion t ON t.IdTipoPublicacion = p.IdTipoPublicacion
				""";
	}

	private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
		double value = rs.getDouble(column);
		return rs.wasNull() ? null : value;
	}

	private static String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private record ServiceBase(
			String id, String ownerId, String owner, String district, String phone, Integer categoryId,
			String category, String title, String description, java.math.BigDecimal priceMin,
			java.math.BigDecimal priceMax, String location, Double latitude, Double longitude,
			Double coverageRadiusMeters, java.time.LocalDateTime publishedAt, Integer districtId) {
	}

	private static final RowMapper<ServiceBase> SERVICE_BASE_MAPPER = (rs, row) ->
			new ServiceBase(rs.getString("IdServicio"), rs.getString("IdUsuario"),
					rs.getString("NombreUsuario"), rs.getString("NombreDistrito"), rs.getString("Celular"),
					rs.getInt("IdCategoria"), rs.getString("NombreCategoria"),
					rs.getString("Titulo"), rs.getString("Descripcion"),
					rs.getBigDecimal("PrecioMinimo"), rs.getBigDecimal("PrecioMaximo"),
					rs.getString("UbicacionAproximada"), nullableDouble(rs, "Latitud"),
					nullableDouble(rs, "Longitud"), nullableDouble(rs, "RadioCoberturaMetros"),
					rs.getTimestamp("FechaPublicacion").toLocalDateTime(), rs.getInt("IdDistrito"));

	private static final RowMapper<ImageView> IMAGE_MAPPER = (rs, row) ->
			new ImageView(rs.getString("IdImagen"), rs.getString("UrlRemota"),
					rs.getInt("Orden"), rs.getTimestamp("FechaActualizacion").toLocalDateTime());

	private static final RowMapper<ReviewView> REVIEW_MAPPER = (rs, row) ->
			new ReviewView(rs.getString("IdResena"), rs.getString("IdServicio"),
					rs.getString("IdUsuario"), rs.getString("NombreUsuario"),
					rs.getInt("Calificacion"), rs.getString("Comentario"),
					rs.getTimestamp("FechaResena").toLocalDateTime());

	private static final RowMapper<ReplyView> REPLY_MAPPER = (rs, row) ->
			new ReplyView(rs.getString("IdRespuesta"), rs.getString("IdPublicacion"),
					rs.getString("IdUsuario"), rs.getString("NombreUsuario"),
					rs.getString("Mensaje"), rs.getTimestamp("FechaRespuesta").toLocalDateTime());

	private static final RowMapper<EmergencyView> EMERGENCY_MAPPER = (rs, row) ->
			new EmergencyView(rs.getString("IdEmergencia"), rs.getString("IdPublicacion"),
					rs.getString("EstadoEmergencia"), rs.getString("NivelPrioridad"),
					rs.getString("Seguimiento"), rs.getTimestamp("FechaActualizacion").toLocalDateTime());
}
