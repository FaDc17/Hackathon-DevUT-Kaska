import type { User } from "../types";
import {
  getUserById,
  saveSession,
  cacheRemoteUser,
  updateUser,
  districtIdByName,
} from "../database/repositories/users";
import { getMyProfile, logoutRequest, updateMyProfile } from "./auth";
import type { AuthResponse, ProfileUpdateRequest } from "./auth";
import { ApiError } from "./apiClient";
import {
  clearSecureSession,
  getSecureSession,
  saveSecureSession,
} from "./secureSession";
import { getSavedSession } from "../database/repositories/users";

export async function establishSession(response: AuthResponse): Promise<User> {
  await saveSecureSession({ accessToken: response.accessToken, userId: response.user.id });
  const user = await cacheRemoteUser(response.user);
  await saveSession(user.id);
  return user;
}

export async function restoreSession(): Promise<User | null> {
  const localId = await getSavedSession();
  if (!localId) return null;

  const secureSession = await getSecureSession();
  if (!secureSession?.accessToken) {
    await saveSession(null);
    return null;
  }

  try {
    const user = await cacheRemoteUser(await getMyProfile());
    await saveSession(user.id);
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSecureSession();
      await saveSession(null);
      return null;
    }
    return getUserById(localId);
  }
}

export async function updateProfileOnlineOrQueue(user: User): Promise<User> {
  const districtId = user.districtId ?? await districtIdByName(user.district);
  const request: ProfileUpdateRequest = {
    username: user.name.trim(),
    phone: user.phone,
    address: user.address.trim(),
    districtId,
    about: user.about || "",
  };
  try {
    const updated = await updateMyProfile(request);
    const cached = await cacheRemoteUser(updated);
    await updateUser(cached, false);
    return cached;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 0) throw error;
    await updateUser(user, true);
    return { ...user, districtId, syncStatus: "pendiente" };
  }
}

export async function closeSession(): Promise<void> {
  try {
    await logoutRequest();
  } catch {
    // Local logout must still complete when the device is offline or the token expired.
  } finally {
    await clearSecureSession();
    await saveSession(null);
  }
}
