package com.kuska.api.content;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import com.kuska.api.content.ContentDtos.EmergencyRequest;
import com.kuska.api.content.ContentDtos.EmergencyView;
import com.kuska.api.content.ContentDtos.ServiceRequest;
import com.kuska.api.user.AuthService;
import tools.jackson.databind.ObjectMapper;

import jakarta.validation.Validator;

@ExtendWith(MockitoExtension.class)
class ContentServiceTests {

	@Mock
	private ContentRepository repository;

	@Mock
	private AuthService authService;

	@Mock
	private Validator validator;

	private ContentService service;

	@BeforeEach
	void setUp() {
		service = new ContentService(repository, authService, new ObjectMapper(), validator);
		lenient().when(validator.validate(org.mockito.ArgumentMatchers.any())).thenReturn(Set.of());
	}

	@Test
	void createsServiceUsingAuthenticatedOwnerAndExistingCategory() {
		ServiceRequest request = new ServiceRequest(
				"svc-1", 3, "Carpintería", "Reparaciones", null, null,
				"Lima", null, null, null, List.of());
		when(repository.categoryExists(3)).thenReturn(true);
		when(repository.serviceExists("svc-1")).thenReturn(false);

		service.createService("user-1", request);

		verify(repository).insertService("user-1", request);
		verify(repository).service("svc-1");
	}

	@Test
	void rejectsUpdatingAnotherUsersServiceBeforeWriting() {
		ServiceRequest request = new ServiceRequest(
				"svc-1", 3, "Carpintería", "Reparaciones", null, null,
				"Lima", null, null, null, null);
		when(repository.serviceOwner("svc-1")).thenReturn("user-2");

		assertThrows(AccessDeniedException.class,
				() -> service.updateService("user-1", "svc-1", request));

		verify(repository, never()).updateService("svc-1", request);
	}

	@Test
	void deleteServiceIsRetryableButStillChecksOriginalOwner() {
		when(repository.serviceOwnerIncludingDeleted("svc-1")).thenReturn("user-1");
		service.deleteService("user-1", "svc-1");
		service.deleteService("user-1", "svc-1");
		verify(repository, org.mockito.Mockito.times(2)).softDeleteService("svc-1");
		assertThrows(AccessDeniedException.class, () -> service.deleteService("user-2", "svc-1"));
		verify(repository, org.mockito.Mockito.times(2)).softDeleteService("svc-1");
	}

	@Test
	void deletePostUsesTombstoneOwnerAndRejectsOtherUsers() {
		when(repository.postOwnerIncludingDeleted("post-1")).thenReturn("user-1");
		service.deletePost("user-1", "post-1");
		service.deletePost("user-1", "post-1");
		assertThrows(AccessDeniedException.class, () -> service.deletePost("user-2", "post-1"));
		verify(repository, org.mockito.Mockito.times(2)).softDeletePost("post-1");
	}

	@Test
	void syncDeletionAcceptsMinimalPayloadAndPreservesOriginalIds() {
		when(repository.serviceOwnerIncludingDeleted("svc-uuid-original")).thenReturn("user-1");
		service.applySyncOperation("user-1", new ContentDtos.SyncOperation("op-delete", "Servicios",
				"eliminar", "svc-uuid-original", new ObjectMapper().readTree("{}")));
		verify(repository).softDeleteService("svc-uuid-original");
	}

	@Test
	void syncReplyUsesJwtOwnerRatherThanLocalPresentationFields() {
		when(repository.reply("reply-original")).thenReturn(Optional.of(new ContentDtos.ReplyView(
				"reply-original", "post-1", "user-1", "Real owner", "Hola", LocalDateTime.now())));
		service.applySyncOperation("user-1", new ContentDtos.SyncOperation("op-reply", "RespuestasPublicacion",
				"crear", "reply-original", new ObjectMapper().readTree("""
				{"id":"reply-original","postId":"post-1","message":"Hola",
				"userId":"other-user","username":"Presentación local","createdAt":123}
				""")));
		verify(repository).insertReply("reply-original", "post-1", "user-1", "Hola");
	}

	@Test
	void syncReviewUsesJwtOwnerRatherThanLocalPresentationFields() {
		when(repository.review("review-original")).thenReturn(Optional.of(new ContentDtos.ReviewView(
				"review-original", "svc-1", "user-1", "Real owner", 5, "Gracias", LocalDateTime.now())));
		service.applySyncOperation("user-1", new ContentDtos.SyncOperation("op-review", "ResenasServicio",
				"actualizar", "review-original", new ObjectMapper().readTree("""
				{"id":"review-original","serviceId":"svc-1","rating":5,"comment":"Gracias",
				"userId":"other-user","username":"Presentación local","createdAt":"2026-11-08"}
				""")));
		verify(repository).insertReview("review-original", "svc-1", "user-1", new ContentDtos.ReviewRequest("review-original", 5, "Gracias"));
	}

	@Test
	void createDoesNotRestoreAnExistingDeletedService() {
		ServiceRequest request = new ServiceRequest("svc-1", 3, "Servicio", "Descripción",
				null, null, null, null, null, null, null);
		when(repository.categoryExists(3)).thenReturn(true);
		when(repository.serviceExists("svc-1")).thenReturn(true);
		when(repository.serviceOwner("svc-1"))
				.thenThrow(new com.kuska.api.catalog.ResourceNotFoundException("Servicio no encontrado."));
		assertThrows(com.kuska.api.catalog.ResourceNotFoundException.class,
				() -> service.createService("user-1", request));
		verify(repository, never()).insertService("user-1", request);
	}

	@Test
	void rejectsPricesOutsideAzureDecimalPrecision() {
		ServiceRequest request = new ServiceRequest(
				"svc-1", 3, "Carpintería", "Reparaciones",
				new java.math.BigDecimal("100000000.00"), null,
				"Lima", null, null, null, null);
		assertThrows(IllegalArgumentException.class,
				() -> service.createService("user-1", request));

		verify(repository, never()).insertService("user-1", request);
	}

	@Test
	void rejectsImageDataUrisInsteadOfStoringFilesOnBackend() {
		ContentDtos.ImageRequest request =
				new ContentDtos.ImageRequest("img-1", "data:image/png;base64,abc", 0);
		when(repository.serviceOwner("svc-1")).thenReturn("user-1");
		assertThrows(IllegalArgumentException.class,
				() -> service.addServiceImage("user-1", "svc-1", request));

		verify(repository, never()).insertServiceImage("svc-1", request);
	}

	@Test
	void updatesEmergencyAlreadyCreatedForPublicationUsingItsCanonicalId() {
		EmergencyRequest request = new EmergencyRequest(
				"emergencia-post-1", "post-1", "reportada", "media", "Seguimiento");
		EmergencyView existing = new EmergencyView(
				"emergencia-post-1", "post-1", "reportada", "media", null, LocalDateTime.now());
		when(repository.postOwner("post-1")).thenReturn("user-1");
		when(repository.emergencyForPost("post-1")).thenReturn(Optional.of(existing));
		when(repository.emergency("emergencia-post-1")).thenReturn(Optional.of(existing));

		EmergencyView result = service.createEmergency("user-1", request);

		assertEquals("emergencia-post-1", result.id());
		verify(repository).updateEmergency(
				"emergencia-post-1", "reportada", "media", "Seguimiento");
		verify(repository, never()).insertEmergency(
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.any());
	}

	@Test
	void rejectsDifferentEmergencyIdForPublicationThatAlreadyHasOne() {
		EmergencyRequest request = new EmergencyRequest(
				"another-id", "post-1", "reportada", "media", null);
		EmergencyView existing = new EmergencyView(
				"emergencia-post-1", "post-1", "reportada", "media", null, LocalDateTime.now());
		when(repository.postOwner("post-1")).thenReturn("user-1");
		when(repository.emergencyForPost("post-1")).thenReturn(Optional.of(existing));

		assertThrows(ResourceConflictException.class,
				() -> service.createEmergency("user-1", request));

		verify(repository, never()).updateEmergency(
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.any());
		verify(repository, never()).insertEmergency(
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.anyString(),
				org.mockito.ArgumentMatchers.any());
	}
}
