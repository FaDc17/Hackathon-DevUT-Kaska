import { getSecureSession } from "./secureSession";
import { updateMyProfile, type ProfileUpdateRequest } from "./auth";
import {
  markProfileOperationFailed,
  pendingProfileOperations,
  removeProfileOperation,
  cacheRemoteUser,
  updateUser,
} from "../database/repositories/users";
import { ApiError } from "./apiClient";

let syncInProgress: Promise<void> | null = null;

export function syncPendingProfileUpdates(): Promise<void> {
  if (syncInProgress) return syncInProgress;
  syncInProgress = synchronize().finally(() => {
    syncInProgress = null;
  });
  return syncInProgress;
}

async function synchronize(): Promise<void> {
  const session = await getSecureSession();
  if (!session?.accessToken || !navigator.onLine) return;

  const operations = await pendingProfileOperations(session.userId);
  for (const operation of operations) {
    let payload: ProfileUpdateRequest;
    try {
      payload = JSON.parse(operation.Payload) as ProfileUpdateRequest;
      if (
        !payload.username ||
        !payload.phone ||
        !payload.address ||
        !Number.isInteger(payload.districtId)
      ) {
        throw new Error("invalid-payload");
      }
    } catch {
      await markProfileOperationFailed(operation.IdOperacion, "INVALID_LOCAL_OPERATION");
      return;
    }

    try {
      const saved = await updateMyProfile(
        payload,
        `usuarios:${operation.EntidadId}:${operation.IdOperacion}`,
      );
      const user = await cacheRemoteUser(saved);
      await updateUser(user, false);
      await removeProfileOperation(operation.IdOperacion);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      const safeError =
        error instanceof ApiError ? `${error.code}:${error.status}` : "SYNC_FAILED";
      await markProfileOperationFailed(operation.IdOperacion, safeError);
      return;
    }
  }
}
