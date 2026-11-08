package com.kuska.api.content;

import java.util.ArrayList;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.kuska.api.content.ContentDtos.EmergencyRequest;
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
import com.kuska.api.content.ContentDtos.SyncOperation;
import com.kuska.api.content.ContentDtos.SyncResult;
import com.kuska.api.security.AuthenticatedUser;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

@RestController
@Profile("!test")
public class ContentController {

	private final ContentService content;

	public ContentController(ContentService content) {
		this.content = content;
	}

	@GetMapping("/api/servicios")
	public List<ServiceView> services() {
		return content.services();
	}

	@GetMapping("/api/servicios/{serviceId}")
	public ServiceView service(@PathVariable String serviceId) {
		return content.service(serviceId);
	}

	@PostMapping("/api/servicios")
	public ResponseEntity<ServiceView> createService(
			@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody ServiceRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(content.createService(user.id(), request));
	}

	@PutMapping("/api/servicios/{serviceId}")
	public ServiceView updateService(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String serviceId,
			@Valid @RequestBody ServiceRequest request) {
		return content.updateService(user.id(), serviceId, request);
	}

	@DeleteMapping("/api/servicios/{serviceId}")
	public ResponseEntity<Void> deleteService(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String serviceId) {
		content.deleteService(user.id(), serviceId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/api/servicios/{serviceId}/imagenes")
	public List<ImageView> serviceImages(@PathVariable String serviceId) {
		return content.serviceImages(serviceId);
	}

	@PostMapping("/api/servicios/{serviceId}/imagenes")
	public ResponseEntity<ImageView> addServiceImage(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String serviceId,
			@Valid @RequestBody ImageRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(content.addServiceImage(user.id(), serviceId, request));
	}

	@DeleteMapping("/api/imagenes-servicio/{imageId}")
	public ResponseEntity<Void> deleteServiceImage(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String imageId) {
		content.deleteServiceImage(user.id(), imageId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/api/servicios/{serviceId}/resenas")
	public List<ReviewView> reviews(@PathVariable String serviceId) {
		return content.reviews(serviceId);
	}

	@PutMapping("/api/servicios/{serviceId}/resenas")
	public ReviewView saveReview(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String serviceId,
			@Valid @RequestBody ReviewRequest request) {
		return content.saveReview(user.id(), serviceId, request);
	}

	@DeleteMapping("/api/resenas-servicio/{reviewId}")
	public ResponseEntity<Void> deleteReview(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String reviewId) {
		content.deleteReview(user.id(), reviewId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/api/usuarios/me/favoritos")
	public List<ServiceView> favorites(@AuthenticationPrincipal AuthenticatedUser user) {
		return content.favorites(user.id());
	}

	@PostMapping("/api/servicios/{serviceId}/favorito")
	public ResponseEntity<Void> addFavorite(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String serviceId) {
		content.addFavorite(user.id(), serviceId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("/api/servicios/{serviceId}/favorito")
	public ResponseEntity<Void> deleteFavorite(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String serviceId) {
		content.deleteFavorite(user.id(), serviceId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/api/publicaciones")
	public List<PostView> posts() {
		return content.posts();
	}

	@GetMapping("/api/publicaciones/{postId}")
	public PostView post(@PathVariable String postId) {
		return content.post(postId);
	}

	@PostMapping("/api/publicaciones")
	public ResponseEntity<PostView> createPost(
			@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody PostRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(content.createPost(user.id(), request));
	}

	@PutMapping("/api/publicaciones/{postId}")
	public PostView updatePost(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String postId,
			@Valid @RequestBody PostRequest request) {
		return content.updatePost(user.id(), postId, request);
	}

	@DeleteMapping("/api/publicaciones/{postId}")
	public ResponseEntity<Void> deletePost(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String postId) {
		content.deletePost(user.id(), postId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/api/publicaciones/{postId}/imagenes")
	public List<ImageView> postImages(@PathVariable String postId) {
		return content.postImages(postId);
	}

	@PostMapping("/api/publicaciones/{postId}/imagenes")
	public ResponseEntity<ImageView> addPostImage(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String postId,
			@Valid @RequestBody ImageRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(content.addPostImage(user.id(), postId, request));
	}

	@DeleteMapping("/api/imagenes-publicacion/{imageId}")
	public ResponseEntity<Void> deletePostImage(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String imageId) {
		content.deletePostImage(user.id(), imageId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/api/publicaciones/{postId}/respuestas")
	public List<ReplyView> replies(@PathVariable String postId) {
		return content.replies(postId);
	}

	@PostMapping("/api/publicaciones/{postId}/respuestas")
	public ResponseEntity<ReplyView> createReply(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String postId,
			@Valid @RequestBody ReplyRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(content.createReply(user.id(), postId, request));
	}

	@PutMapping("/api/respuestas-publicacion/{replyId}")
	public ReplyView updateReply(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String replyId,
			@Valid @RequestBody ReplyRequest request) {
		return content.updateReply(user.id(), replyId, request);
	}

	@DeleteMapping("/api/respuestas-publicacion/{replyId}")
	public ResponseEntity<Void> deleteReply(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String replyId) {
		content.deleteReply(user.id(), replyId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/api/emergencias")
	public List<ContentDtos.EmergencyView> emergencies() {
		return content.emergencies();
	}

	@PostMapping("/api/emergencias")
	public ResponseEntity<ContentDtos.EmergencyView> createEmergency(
			@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody EmergencyRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(content.createEmergency(user.id(), request));
	}

	@PutMapping("/api/emergencias/{emergencyId}")
	public ContentDtos.EmergencyView updateEmergency(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String emergencyId,
			@Valid @RequestBody EmergencyRequest request) {
		return content.updateEmergency(user.id(), emergencyId, request);
	}

	@DeleteMapping("/api/emergencias/{emergencyId}")
	public ResponseEntity<Void> deleteEmergency(
			@AuthenticationPrincipal AuthenticatedUser user,
			@PathVariable String emergencyId) {
		content.deleteEmergency(user.id(), emergencyId);
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/api/sync/operations")
	public List<SyncResult> synchronize(
			@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody @Size(max = 100) List<@Valid SyncOperation> operations) {
		List<SyncResult> results = new ArrayList<>(operations.size());
		for (SyncOperation operation : operations) {
			try {
				content.applySyncOperation(user.id(), operation);
				results.add(new SyncResult(operation.operationId(), true, null));
			} catch (RuntimeException exception) {
				results.add(new SyncResult(operation.operationId(), false, syncErrorCode(exception)));
			}
		}
		return results;
	}

	private String syncErrorCode(RuntimeException exception) {
		if (exception instanceof org.springframework.security.access.AccessDeniedException) {
			return "FORBIDDEN";
		}
		if (exception instanceof org.springframework.dao.DataIntegrityViolationException
				|| exception instanceof ResourceConflictException) {
			return "DATA_CONFLICT";
		}
		if (exception instanceof com.kuska.api.catalog.ResourceNotFoundException) {
			return "NOT_FOUND";
		}
		if (exception instanceof IllegalArgumentException) {
			return "INVALID_OPERATION";
		}
		return "SYNC_FAILED";
	}
}
