package com.kuska.api.content;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import tools.jackson.databind.JsonNode;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class ContentDtos {

	private ContentDtos() {
	}

	public record ImageRequest(
			@NotBlank @Size(max = 100) String id,
			@NotBlank @Size(max = 1000) String url,
			@NotNull @Min(0) Integer order) {
	}

	public record ServiceRequest(
			@NotBlank @Size(max = 100) String id,
			@NotNull @Min(1) Integer categoryId,
			@NotBlank @Size(max = 150) String title,
			@NotBlank @Size(max = 2000) String description,
			@DecimalMin("0.00") BigDecimal priceMin,
			@DecimalMin("0.00") BigDecimal priceMax,
			@Size(max = 200) String location,
			@DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
			@DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
			@DecimalMin("0.0") Double coverageRadiusMeters,
			@Valid List<ImageRequest> images) {
	}

	public record ReviewRequest(
			@NotBlank @Size(max = 100) String id,
			@NotNull @Min(1) @Max(5) Integer rating,
			@Size(max = 1000) String comment) {
	}

	public record PostRequest(
			@NotBlank @Size(max = 100) String id,
			@NotNull @Min(1) Integer typeId,
			@NotBlank @Size(max = 150) String title,
			@NotBlank @Size(max = 2000) String description,
			@Size(max = 200) String location,
			@DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
			@DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
			@DecimalMin("0.0") Double approximateRadiusMeters,
			@Valid List<ImageRequest> images) {
	}

	public record ReplyRequest(
			@NotBlank @Size(max = 100) String id,
			@NotBlank @Size(max = 2000) String message) {
	}

	public record EmergencyRequest(
			@NotBlank @Size(max = 100) String id,
			@Size(max = 100) String postId,
			@NotBlank @Size(max = 20) String status,
			@NotBlank @Size(max = 20) String priority,
			@Size(max = 1000) String followUp) {
	}

	public record ReviewSyncRequest(
			@NotBlank @Size(max = 100) String id,
			@NotBlank @Size(max = 100) String serviceId,
			@NotNull @Min(1) @Max(5) Integer rating,
			@Size(max = 1000) String comment) {
	}

	public record SyncOperation(
			@NotBlank @Size(max = 200) String operationId,
			@NotBlank @Size(max = 40) String entity,
			@NotBlank @Size(max = 20) String operation,
			@NotBlank @Size(max = 100) String entityId,
			@NotNull JsonNode payload) {
	}

	public record SyncResult(String operationId, boolean synchronizedOperation, String error) {
	}

	public record ImageView(
			String id,
			String url,
			Integer order,
			LocalDateTime updatedAt) {
	}

	public record ReviewView(
			String id,
			String serviceId,
			String userId,
			String username,
			Integer rating,
			String comment,
			LocalDateTime createdAt) {
	}

	public record ServiceView(
			String id,
			String ownerId,
			String owner,
			String phone,
			String district,
			Integer categoryId,
			String category,
			String title,
			String description,
			BigDecimal priceMin,
			BigDecimal priceMax,
			String location,
			Double latitude,
			Double longitude,
			Double coverageRadiusMeters,
			LocalDateTime publishedAt,
			List<ImageView> images,
			List<ReviewView> reviews) {
	}

	public record ReplyView(
			String id,
			String postId,
			String userId,
			String username,
			String message,
			LocalDateTime createdAt) {
	}

	public record EmergencyView(
			String id,
			String postId,
			String status,
			String priority,
			String followUp,
			LocalDateTime updatedAt) {
	}

	public record PostView(
			String id,
			String ownerId,
			String owner,
			String district,
			Integer typeId,
			String type,
			String title,
			String description,
			String location,
			Double latitude,
			Double longitude,
			Double approximateRadiusMeters,
			LocalDateTime publishedAt,
			List<ImageView> images,
			List<ReplyView> replies,
			EmergencyView emergency) {
	}
}
