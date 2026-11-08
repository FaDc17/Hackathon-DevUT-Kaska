package com.kuska.api.content;

import java.net.URI;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kuska.api.catalog.ResourceNotFoundException;
import com.kuska.api.content.ContentDtos.EmergencyRequest;
import com.kuska.api.content.ContentDtos.ImageRequest;
import com.kuska.api.content.ContentDtos.ImageView;
import com.kuska.api.content.ContentDtos.PostRequest;
import com.kuska.api.content.ContentDtos.PostView;
import com.kuska.api.content.ContentDtos.ReplyRequest;
import com.kuska.api.content.ContentDtos.ReplyView;
import com.kuska.api.content.ContentDtos.ReviewRequest;
import com.kuska.api.content.ContentDtos.ReviewSyncRequest;
import com.kuska.api.content.ContentDtos.ReviewView;
import com.kuska.api.content.ContentDtos.ServiceRequest;
import com.kuska.api.content.ContentDtos.ServiceView;
import com.kuska.api.user.AuthService;
import com.kuska.api.user.UserDtos;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
@Profile("!test")
public class ContentService {

	private static final Set<String> EMERGENCY_STATUSES =
			Set.of("reportada", "verificada", "atendida", "resuelta", "cancelada");
	private static final Set<String> EMERGENCY_PRIORITIES =
			Set.of("baja", "media", "alta", "critica");

	private final ContentRepository content;
	private final AuthService auth;
	private final ObjectMapper objectMapper;
	private final Validator validator;

	public ContentService(
			ContentRepository content,
			AuthService auth,
			ObjectMapper objectMapper,
			Validator validator) {
		this.content = content;
		this.auth = auth;
		this.objectMapper = objectMapper;
		this.validator = validator;
	}

	@Transactional(readOnly = true)
	public List<ServiceView> services() {
		return content.listServices();
	}

	@Transactional(readOnly = true)
	public List<ServiceView> servicesPage(int page, int size, Integer districtId) {
		validatePage(page,size);
		return content.listServicesPage(page,size,districtId);
	}
	@Transactional(readOnly = true)
	public List<PostView> postsPage(int page, int size, Integer districtId) {
		validatePage(page,size);
		return content.listPostsPage(page,size,districtId);
	}
	private void validatePage(int page, int size) {
		if(page<0 || page>100000 || size<1 || size>50) throw new IllegalArgumentException("Página inválida: tamaño entre 1 y 50.");
	}

	@Transactional(readOnly = true)
	public ServiceView service(String id) {
		return content.service(requireId(id));
	}

	@Transactional
	public ServiceView createService(String userId, ServiceRequest request) {
		validateService(request);
		if (!content.categoryExists(request.categoryId())) {
			throw new ResourceNotFoundException("Categoría de servicio no encontrada.");
		}
		if (content.serviceExists(request.id())) {
			requireOwner(content.serviceOwner(request.id()), userId);
			return content.service(request.id());
		}
		content.insertService(userId, request);
		saveServiceImages(userId, request.id(), request.images());
		return content.service(request.id());
	}

	@Transactional
	public ServiceView updateService(String userId, String id, ServiceRequest request) {
		requireMatchingId(id, request.id());
		requireOwner(content.serviceOwner(id), userId);
		validateService(request);
		if (!content.categoryExists(request.categoryId())) {
			throw new ResourceNotFoundException("Categoría de servicio no encontrada.");
		}
		content.updateService(id, request);
		saveServiceImages(userId, id, request.images());
		return content.service(id);
	}

	@Transactional
	public void deleteService(String userId, String id) {
		requireOwner(content.serviceOwnerIncludingDeleted(requireId(id)), userId);
		content.softDeleteService(id);
	}

	@Transactional(readOnly = true)
	public List<ImageView> serviceImages(String serviceId) {
		content.service(serviceId);
		return content.serviceImages(serviceId);
	}

	@Transactional
	public ImageView addServiceImage(String userId, String serviceId, ImageRequest image) {
		requireOwner(content.serviceOwner(serviceId), userId);
		validateImage(image);
		if (content.serviceImageExists(image.id())) {
			requireOwner(content.serviceImageOwner(image.id()), userId);
			if (!serviceId.equals(content.serviceImageParent(image.id()))) {
				throw new ResourceConflictException("El identificador de imagen ya está asociado a otro servicio.");
			}
			content.updateServiceImage(image.id(), image);
		} else {
			content.insertServiceImage(serviceId, image);
		}
		return content.serviceImage(image.id()).orElseThrow();
	}

	@Transactional
	public void deleteServiceImage(String userId, String imageId) {
		requireOwner(content.serviceImageOwner(imageId), userId);
		content.softDeleteServiceImage(imageId);
	}

	@Transactional(readOnly = true)
	public List<ReviewView> reviews(String serviceId) {
		content.service(serviceId);
		return content.reviews(serviceId);
	}

	@Transactional
	public ReviewView saveReview(String userId, String serviceId, ReviewRequest request) {
		content.service(serviceId);
		var existingId = content.reviewIdFor(serviceId, userId);
		String id = existingId.orElse(request.id());
		if (existingId.isPresent()) {
			requireOwner(content.reviewOwner(id), userId);
			content.updateReview(id, request);
		} else {
			if (content.reviewExists(id)) {
				throw new ResourceConflictException("El identificador de reseña ya está en uso.");
			}
			content.insertReview(id, serviceId, userId, request);
		}
		return content.review(id).orElseThrow();
	}

	@Transactional
	public void deleteReview(String userId, String reviewId) {
		requireOwner(content.reviewOwner(reviewId), userId);
		content.softDeleteReview(reviewId);
	}

	@Transactional(readOnly = true)
	public List<ServiceView> favorites(String userId) {
		return content.favoriteServices(userId);
	}

	@Transactional
	public void addFavorite(String userId, String serviceId) {
		content.service(serviceId);
		content.insertFavorite(userId, serviceId);
	}

	@Transactional
	public void deleteFavorite(String userId, String serviceId) {
		content.softDeleteFavorite(userId, serviceId);
	}

	@Transactional(readOnly = true)
	public List<PostView> posts() {
		return content.listPosts();
	}

	@Transactional(readOnly = true)
	public PostView post(String id) {
		return content.post(requireId(id));
	}

	@Transactional
	public PostView createPost(String userId, PostRequest request) {
		validatePost(request);
		if (!content.publicationTypeExists(request.typeId())) {
			throw new ResourceNotFoundException("Tipo de publicación no encontrado.");
		}
		if (content.postExists(request.id())) {
			requireOwner(content.postOwner(request.id()), userId);
			return content.post(request.id());
		}
		content.insertPost(userId, request);
		savePostImages(userId, request.id(), request.images());
		return content.post(request.id());
	}

	@Transactional
	public PostView updatePost(String userId, String id, PostRequest request) {
		requireMatchingId(id, request.id());
		requireOwner(content.postOwner(id), userId);
		validatePost(request);
		if (!content.publicationTypeExists(request.typeId())) {
			throw new ResourceNotFoundException("Tipo de publicación no encontrado.");
		}
		content.updatePost(id, request);
		savePostImages(userId, id, request.images());
		return content.post(id);
	}

	@Transactional
	public void deletePost(String userId, String id) {
		requireOwner(content.postOwnerIncludingDeleted(requireId(id)), userId);
		content.softDeletePost(id);
	}

	@Transactional(readOnly = true)
	public List<ImageView> postImages(String postId) {
		content.post(postId);
		return content.postImages(postId);
	}

	@Transactional
	public ImageView addPostImage(String userId, String postId, ImageRequest image) {
		requireOwner(content.postOwner(postId), userId);
		validateImage(image);
		if (content.postImageExists(image.id())) {
			requireOwner(content.postImageOwner(image.id()), userId);
			if (!postId.equals(content.postImageParent(image.id()))) {
				throw new ResourceConflictException("El identificador de imagen ya está asociado a otra publicación.");
			}
			content.updatePostImage(image.id(), image);
		} else {
			content.insertPostImage(postId, image);
		}
		return content.postImage(image.id()).orElseThrow();
	}

	@Transactional
	public void deletePostImage(String userId, String imageId) {
		requireOwner(content.postImageOwner(imageId), userId);
		content.softDeletePostImage(imageId);
	}

	@Transactional(readOnly = true)
	public List<ReplyView> replies(String postId) {
		content.post(postId);
		return content.replies(postId);
	}

	@Transactional
	public ReplyView createReply(String userId, String postId, ReplyRequest request) {
		content.post(postId);
		if (content.replyExists(request.id())) {
			if (!content.replyOwner(request.id()).equals(userId)
					|| !content.replyParent(request.id()).equals(postId)) {
				throw new ResourceConflictException("El identificador de respuesta ya está en uso.");
			}
			content.updateReply(request.id(), request.message());
		} else {
			content.insertReply(request.id(), postId, userId, request.message());
		}
		return content.reply(request.id()).orElseThrow();
	}

	@Transactional
	public ReplyView updateReply(String userId, String replyId, ReplyRequest request) {
		requireMatchingId(replyId, request.id());
		requireOwner(content.replyOwner(replyId), userId);
		content.updateReply(replyId, request.message());
		return content.reply(replyId).orElseThrow();
	}

	@Transactional
	public void deleteReply(String userId, String replyId) {
		requireOwner(content.replyOwner(replyId), userId);
		content.softDeleteReply(replyId);
	}

	@Transactional(readOnly = true)
	public List<ContentDtos.EmergencyView> emergencies() {
		return content.listEmergencies();
	}

	@Transactional
	public ContentDtos.EmergencyView createEmergency(String userId, EmergencyRequest request) {
		String postId = requireId(request.postId());
		requireOwner(content.postOwner(postId), userId);
		validateEmergency(request);
		var existing = content.emergencyForPost(postId);
		if (existing.isPresent()) {
			if (!existing.get().id().equals(request.id())) {
				throw new ResourceConflictException("La publicación ya tiene un reporte de emergencia.");
			}
			content.updateEmergency(request.id(), request.status(), request.priority(), request.followUp());
		} else if (content.emergencyExists(request.id())) {
			throw new ResourceConflictException("El identificador de emergencia ya está en uso.");
		} else {
			content.insertEmergency(request.id(), postId, request.status(),
					request.priority(), request.followUp());
		}
		return content.emergency(request.id()).orElseThrow();
	}

	@Transactional
	public ContentDtos.EmergencyView updateEmergency(
			String userId, String emergencyId, EmergencyRequest request) {
		requireMatchingId(emergencyId, request.id());
		requireOwner(content.emergencyOwner(emergencyId), userId);
		validateEmergency(request);
		content.updateEmergency(emergencyId, request.status(), request.priority(), request.followUp());
		return content.emergency(emergencyId).orElseThrow();
	}

	@Transactional
	public void deleteEmergency(String userId, String emergencyId) {
		requireOwner(content.emergencyOwner(emergencyId), userId);
		content.softDeleteEmergency(emergencyId);
	}

	@Transactional
	public void applySyncOperation(String userId, ContentDtos.SyncOperation operation) {
		String action = operation.operation().trim().toLowerCase();
		String entity = operation.entity().trim();
		switch (entity) {
			case "Usuarios" -> syncProfile(userId, action, operation);
			case "Servicios" -> syncService(userId, action, operation);
			case "ImagenesServicio" -> syncServiceImage(userId, action, operation);
			case "ServiciosFavoritos" -> syncFavorite(userId, action, operation);
			case "ResenasServicio" -> syncReview(userId, action, operation);
			case "Publicaciones" -> syncPost(userId, action, operation);
			case "ImagenesPublicacion" -> syncPostImage(userId, action, operation);
			case "RespuestasPublicacion" -> syncReply(userId, action, operation);
			case "Emergencias" -> syncEmergency(userId, action, operation);
			default -> throw new IllegalArgumentException("La entidad no admite sincronización.");
		}
	}

	private void syncProfile(String userId, String action, ContentDtos.SyncOperation operation) {
		if (!"actualizar".equals(action) || !userId.equals(operation.entityId())) {
			throw new AccessDeniedException("Solo se pueden sincronizar cambios del perfil propio.");
		}
		UserDtos.ProfileUpdateRequest request =
				convert(operation.payload(), UserDtos.ProfileUpdateRequest.class);
		validateRequest(request);
		auth.updateProfile(userId, request);
	}

	private void syncService(String userId, String action, ContentDtos.SyncOperation operation) {
		if ("eliminar".equals(action)) {
			deleteService(userId, operation.entityId());
			return;
		}
		ServiceRequest request = convert(operation.payload(), ServiceRequest.class);
		validateRequest(request);
		requireMatchingId(operation.entityId(), request.id());
		switch (action) {
			case "crear" -> createService(userId, request);
			case "actualizar" -> updateService(userId, request.id(), request);
			case "eliminar" -> deleteService(userId, request.id());
			default -> throw invalidSyncAction();
		}
	}

	private void syncServiceImage(String userId, String action, ContentDtos.SyncOperation operation) {
		ImageSyncRequest request = convert(operation.payload(), ImageSyncRequest.class);
		validateRequest(request);
		requireMatchingId(operation.entityId(), request.id());
		String serviceId = requireId(request.serviceId());
		switch (action) {
			case "crear" -> addServiceImage(userId, serviceId,
					new ImageRequest(request.id(), request.url(), request.order()));
			case "actualizar" -> addServiceImage(userId, serviceId,
					new ImageRequest(request.id(), request.url(), request.order()));
			case "eliminar" -> deleteServiceImage(userId, request.id());
			default -> throw invalidSyncAction();
		}
	}

	private void syncFavorite(String userId, String action, ContentDtos.SyncOperation operation) {
		requireId(operation.entityId());
		switch (action) {
			case "crear", "actualizar" -> addFavorite(userId, operation.entityId());
			case "eliminar" -> deleteFavorite(userId, operation.entityId());
			default -> throw invalidSyncAction();
		}
	}

	private void syncReview(String userId, String action, ContentDtos.SyncOperation operation) {
		ReviewSyncRequest request = convert(operation.payload(), ReviewSyncRequest.class);
		validateRequest(request);
		requireMatchingId(operation.entityId(), request.id());
		if ("eliminar".equals(action)) {
			deleteReview(userId, request.id());
			return;
		}
		if (!"crear".equals(action) && !"actualizar".equals(action)) {
			throw invalidSyncAction();
		}
		saveReview(userId, request.serviceId(),
				new ReviewRequest(request.id(), request.rating(), request.comment()));
	}

	private void syncPost(String userId, String action, ContentDtos.SyncOperation operation) {
		if ("eliminar".equals(action)) {
			deletePost(userId, operation.entityId());
			return;
		}
		PostRequest request = convert(operation.payload(), PostRequest.class);
		validateRequest(request);
		requireMatchingId(operation.entityId(), request.id());
		switch (action) {
			case "crear" -> createPost(userId, request);
			case "actualizar" -> updatePost(userId, request.id(), request);
			case "eliminar" -> deletePost(userId, request.id());
			default -> throw invalidSyncAction();
		}
	}

	private void syncPostImage(String userId, String action, ContentDtos.SyncOperation operation) {
		ImageSyncRequest request = convert(operation.payload(), ImageSyncRequest.class);
		validateRequest(request);
		requireMatchingId(operation.entityId(), request.id());
		String postId = requireId(request.postId());
		switch (action) {
			case "crear", "actualizar" -> addPostImage(userId, postId,
					new ImageRequest(request.id(), request.url(), request.order()));
			case "eliminar" -> deletePostImage(userId, request.id());
			default -> throw invalidSyncAction();
		}
	}

	private void syncReply(String userId, String action, ContentDtos.SyncOperation operation) {
		ReplySyncRequest request = convert(operation.payload(), ReplySyncRequest.class);
		validateRequest(request);
		requireMatchingId(operation.entityId(), request.id());
		switch (action) {
			case "crear" -> createReply(userId, request.postId(),
					new ReplyRequest(request.id(), request.message()));
			case "actualizar" -> updateReply(userId, request.id(),
					new ReplyRequest(request.id(), request.message()));
			case "eliminar" -> deleteReply(userId, request.id());
			default -> throw invalidSyncAction();
		}
	}

	private void syncEmergency(String userId, String action, ContentDtos.SyncOperation operation) {
		EmergencyRequest request = convert(operation.payload(), EmergencyRequest.class);
		validateRequest(request);
		requireMatchingId(operation.entityId(), request.id());
		switch (action) {
			case "crear" -> createEmergency(userId, request);
			case "actualizar" -> updateEmergency(userId, request.id(), request);
			case "eliminar" -> deleteEmergency(userId, request.id());
			default -> throw invalidSyncAction();
		}
	}

	private void saveServiceImages(String userId, String serviceId, List<ImageRequest> images) {
		if (images == null) {
			return;
		}
		images.forEach(image -> addServiceImage(userId, serviceId, image));
	}

	private void savePostImages(String userId, String postId, List<ImageRequest> images) {
		if (images == null) {
			return;
		}
		images.forEach(image -> addPostImage(userId, postId, image));
	}

	private void validateService(ServiceRequest request) {
		validateRequest(request);
		if (request.priceMin() != null && request.priceMin().precision() > 10
				|| request.priceMax() != null && request.priceMax().precision() > 10
				|| request.priceMin() != null && request.priceMin().scale() > 2
				|| request.priceMax() != null && request.priceMax().scale() > 2
				|| request.priceMin() != null && request.priceMin().compareTo(new java.math.BigDecimal("99999999.99")) > 0
				|| request.priceMax() != null && request.priceMax().compareTo(new java.math.BigDecimal("99999999.99")) > 0) {
			throw new IllegalArgumentException("El precio debe ajustarse al tipo decimal(10,2).");
		}
		if (request.priceMin() != null && request.priceMax() != null
				&& request.priceMax().compareTo(request.priceMin()) < 0) {
			throw new IllegalArgumentException("El precio máximo no puede ser menor al mínimo.");
		}
	}

	private void validatePost(PostRequest request) {
		validateRequest(request);
	}

	private void validateImage(ImageRequest image) {
		validateRequest(image);
		URI uri;
		try {
			uri = URI.create(image.url().trim());
		} catch (IllegalArgumentException exception) {
			throw new IllegalArgumentException("La imagen debe ser una URL remota válida.");
		}
		if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
			throw new IllegalArgumentException(
					"Solo se aceptan URL HTTPS de imágenes remotas; el backend no almacena archivos localmente.");
		}
	}

	private void validateEmergency(EmergencyRequest request) {
		validateRequest(request);
		if (!EMERGENCY_STATUSES.contains(request.status().trim().toLowerCase())
				|| !EMERGENCY_PRIORITIES.contains(request.priority().trim().toLowerCase())) {
			throw new IllegalArgumentException("Estado o prioridad de emergencia no válidos.");
		}
	}

	private <T> void validateRequest(T request) {
		Set<ConstraintViolation<T>> violations = validator.validate(request);
		if (!violations.isEmpty()) {
			String message = violations.stream().findFirst().orElseThrow().getPropertyPath()
					+ ": " + violations.stream().findFirst().orElseThrow().getMessage();
			throw new IllegalArgumentException(message);
		}
	}

	private <T> T convert(JsonNode payload, Class<T> type) {
		try {
			return objectMapper.treeToValue(payload, type);
		} catch (JacksonException exception) {
			throw new IllegalArgumentException("El payload de sincronización no tiene el formato esperado.");
		}
	}

	private void requireOwner(String resourceOwner, String userId) {
		if (!resourceOwner.equals(userId)) {
			throw new AccessDeniedException("No puedes modificar recursos de otra persona.");
		}
	}

	private String requireId(String id) {
		if (id == null || id.isBlank() || id.length() > 100) {
			throw new IllegalArgumentException("El identificador debe tener entre 1 y 100 caracteres.");
		}
		return id;
	}

	private void requireMatchingId(String pathId, String bodyId) {
		if (!requireId(pathId).equals(requireId(bodyId))) {
			throw new IllegalArgumentException("El identificador de la ruta no coincide con el cuerpo.");
		}
	}

	private IllegalArgumentException invalidSyncAction() {
		return new IllegalArgumentException("La operación de sincronización no es válida.");
	}

	private record ImageSyncRequest(
			@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 100) String id,
			@jakarta.validation.constraints.Size(max = 100) String serviceId,
			@jakarta.validation.constraints.Size(max = 100) String postId,
			@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 1000) String url,
			@jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Min(0) Integer order) {
	}

	private record ReplySyncRequest(
			@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 100) String id,
			@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 100) String postId,
			@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 2000) String message) {
	}
}
