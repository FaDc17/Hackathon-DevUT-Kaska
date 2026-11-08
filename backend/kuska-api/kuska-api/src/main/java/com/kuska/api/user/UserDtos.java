package com.kuska.api.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class UserDtos {

	private UserDtos() {
	}

	public record RegisterRequest(
			@NotBlank
			@Size(min = 3, max = 20)
			@Pattern(regexp = "^[\\p{L}0-9_]+$")
			String username,
			@NotBlank @Size(min = 8, max = 72) String password,
			@NotBlank @Size(max = 24) String phone,
			@NotBlank @Size(min = 5, max = 300) String address,
			@NotNull Integer districtId,
			@Size(max = 1000) String about,
			@Size(max = 72) String confirmPassword) {
		public RegisterRequest(String username, String password, String phone, String address,
				Integer districtId, String about) {
			this(username, password, phone, address, districtId, about, password);
		}
		@Override public String toString() { return "RegisterRequest[credentials=REDACTED]"; }
	}

	public record LoginRequest(
			@NotBlank @Size(max = 50) String username,
			@NotBlank @Size(max = 72) String password) {
		@Override public String toString() { return "LoginRequest[credentials=REDACTED]"; }
	}

	public record ProfileUpdateRequest(
			@NotBlank @Size(min = 3, max = 20) @Pattern(regexp = "^[\\p{L}0-9_]+$") String username,
			@NotBlank @Size(max = 24) String phone,
			@NotBlank @Size(min = 5, max = 300) String address,
			@NotNull Integer districtId,
			@Size(max = 1000) String about) {
		@Override public String toString() { return "ProfileUpdateRequest[privateData=REDACTED]"; }
	}

	public record PasswordChangeRequest(@NotBlank @Size(max = 72) String currentPassword,
			@NotBlank @Size(min = 8, max = 72) String newPassword,
			@NotBlank @Size(max = 72) String confirmPassword) {
		@Override public String toString() { return "PasswordChangeRequest[credentials=REDACTED]"; }
	}

	public record PublicUser(
			String id,
			String username,
			String phone,
			String address,
			Integer districtId,
			String district,
			String province,
			Integer departmentId,
			String department,
			String about) {
	}

	public record AccountDeletionRequest(
			@NotBlank @Size(max = 72) String password,
			@NotBlank @Pattern(regexp = "ELIMINAR") String confirmation) {
		@Override public String toString() { return "AccountDeletionRequest[credentials=REDACTED]"; }
	}

	/** Public provider information: never exposes the private home address. */
	public record NeighborProfile(String id, String username, Integer districtId,
			String district, String province, Integer departmentId, String department, String about) {
	}

	public record AuthResponse(String accessToken, String tokenType, long expiresIn, PublicUser user) {
		@Override public String toString() { return "AuthResponse[accessToken=REDACTED]"; }
	}
}
