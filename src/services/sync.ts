import { getSecureSession } from "./secureSession";
import { apiRequest, ApiError } from "./apiClient";
import {
  markSyncOperationFailed,
  markSyncOperationSucceeded,
  pendingSyncOperations,
  type PendingSyncOperation,
} from "../database/repositories/syncQueue";

type SyncResult = {
  operationId: string;
  synchronizedOperation: boolean;
  error: string | null;
};

let syncInProgress: Promise<void> | null = null;
let syncRequested = false;
let retryTimer: number | null = null;

function scheduleRetry(attempts: number): void {
  if (retryTimer !== null || !navigator.onLine) return;
  const delay = Math.min(60_000, 1_000 * (2 ** Math.min(attempts, 6)));
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void syncPendingProfileUpdates();
  }, delay);
}

export function syncPendingProfileUpdates(): Promise<void> {
  if (syncInProgress) {
    syncRequested = true;
    return syncInProgress;
  }
  syncInProgress = (async () => {
    do {
      syncRequested = false;
      await synchronize();
    } while (syncRequested && navigator.onLine);
  })().finally(() => {
    syncInProgress = null;
  });
  return syncInProgress;
}

async function synchronize(): Promise<void> {
  const session = await getSecureSession();
  if (!session?.accessToken || !navigator.onLine) return;

  const operations = await pendingSyncOperations(100);
  if (operations.length === 0) return;

  const ready: PendingSyncOperation[] = [];
  const payloads = new Map<number, unknown>();
  for (const operation of operations) {
    try {
      if (!operation.Payload) throw new Error("empty-payload");
      payloads.set(operation.IdOperacion, JSON.parse(operation.Payload) as unknown);
      ready.push(operation);
    } catch {
      await markSyncOperationFailed(operation.IdOperacion, "INVALID_LOCAL_OPERATION");
    }
  }
  if (ready.length === 0) return;

  const request = ready.map((operation) => ({
    operationId: `kuska:${operation.IdOperacion}`,
    entity: operation.Entidad,
    operation: operation.Operacion,
    entityId: operation.EntidadId,
    payload: payloads.get(operation.IdOperacion),
  }));

  let results: SyncResult[];
  try {
    results = await apiRequest<SyncResult[]>("/api/sync/operations", {
      method: "POST",
      body: JSON.stringify(request),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    const code = error instanceof ApiError
      ? `${error.code}:${error.status}`
      : "SYNC_FAILED";
    for (const operation of ready) {
      await markSyncOperationFailed(operation.IdOperacion, code);
    }
    if (!(error instanceof ApiError) || error.status === 0) {
      scheduleRetry(Math.max(...ready.map((operation) => operation.Intentos), 0) + 1);
    }
    return;
  }

  const resultById = new Map(results.map((result) => [result.operationId, result]));
  let retryNeeded = false;
  for (const operation of ready) {
    const operationId = `kuska:${operation.IdOperacion}`;
    const result = resultById.get(operationId);
    if (!result) {
      await markSyncOperationFailed(operation.IdOperacion, "MISSING_SYNC_RESULT");
      retryNeeded = true;
      continue;
    }
    if (result.synchronizedOperation) {
      await markSyncOperationSucceeded(
        operation.IdOperacion,
        operation.Entidad,
        operation.EntidadId,
      );
    } else {
      await markSyncOperationFailed(
        operation.IdOperacion,
        result.error || "SYNC_REJECTED",
      );
      retryNeeded ||= result.error === "SYNC_FAILED";
    }
  }
  if (retryNeeded) {
    scheduleRetry(Math.max(...ready.map((operation) => operation.Intentos), 0) + 1);
  }
}
