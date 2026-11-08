import { apiRequest, ApiError } from "./apiClient";
import { getSecureSession } from "./secureSession";

export async function readRemoteList<T>(path: string): Promise<T[] | null> {
  const session = await getSecureSession();
  if (!session?.accessToken || !navigator.onLine) return null;

  try {
    return await apiRequest<T[]>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) return null;
    throw error;
  }
}
