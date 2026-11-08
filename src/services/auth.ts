import { apiRequest } from "./apiClient";
import type { User } from "../types";

export type PublicUser = {
  id: string;
  username: string;
  phone: string;
  address: string;
  districtId: number;
  district: string;
  province: string;
  departmentId: number;
  department: string;
  about: string | null;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: PublicUser;
};

export type RegisterRequest = {
  username: string;
  password: string;
  phone: string;
  address: string;
  districtId: number;
  about?: string;
};

export type ProfileUpdateRequest = Omit<RegisterRequest, "password">;

export function toLocalUser(user: PublicUser): User {
  return {
    id: user.id,
    remoteId: user.id,
    name: user.username,
    phone: user.phone,
    address: user.address,
    district: user.district,
    districtId: user.districtId,
    avatar: user.username.charAt(0).toUpperCase(),
    about: user.about || "",
    syncStatus: "sincronizado",
  };
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function register(request: RegisterRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getMyProfile(): Promise<PublicUser> {
  return apiRequest<PublicUser>("/api/usuarios/me");
}

export function updateMyProfile(
  request: ProfileUpdateRequest,
  operationId?: string,
): Promise<PublicUser> {
  return apiRequest<PublicUser>(
    "/api/usuarios/me",
    { method: "PUT", body: JSON.stringify(request) },
    operationId,
  );
}

export function logoutRequest(): Promise<void> {
  return apiRequest<void>("/api/auth/logout", { method: "POST" });
}
