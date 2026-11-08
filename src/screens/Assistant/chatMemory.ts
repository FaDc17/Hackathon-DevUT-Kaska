import type { ChatMessage, Post, Screen, Service } from "../../types";
import { getSecureSession } from "../../services/secureSession";

export type ChatEntry = ChatMessage & {
  servicios?: Service[];
  publicaciones?: Post[];
  modo?: "ia" | "remoto" | "local";
  acciones?: Screen[];
  sugerencias?: string[];
};

export type ConversationContext = {
  query: string;
  district: string;
  resultIds: Service["id"][];
  postIds: Post["id"][];
  selectedId?: Service["id"];
  pending?: "contact" | "profile" | "detail";
  page?: number;
};

export type ChatSnapshot = {
  messages: ChatEntry[];
  context: ConversationContext | null;
};

const MAX_MESSAGES = 60;
const MEMORY_TTL_MS = 30 * 60 * 1000;

// Conversation data and the session identity stay in memory, never in disk storage.
let identity: { userId: string; accessToken: string } | null = null;
let snapshot: ChatSnapshot | null = null;
let savedAt = 0;
let restoreVersion = 0;
let eventTarget: Window | null = null;

function copySnapshot(value: ChatSnapshot): ChatSnapshot {
  return {
    messages: value.messages.slice(-MAX_MESSAGES).map((entry) => ({
      ...entry,
      servicios: entry.servicios?.map((service) => ({
        ...service,
        reviews: service.reviews.map((review) => ({ ...review })),
      })),
      publicaciones: entry.publicaciones?.map((post) => ({
        ...post,
        comments: post.comments?.map((comment) => ({ ...comment })),
      })),
      acciones: entry.acciones ? [...entry.acciones] : undefined,
      sugerencias: entry.sugerencias ? [...entry.sugerencias] : undefined,
    })),
    context: value.context
      ? {
          ...value.context,
          resultIds: [...value.context.resultIds],
          postIds: [...value.context.postIds],
        }
      : null,
  };
}

export function clearChat(): void {
  snapshot = null;
  savedAt = 0;
}

function forgetSession(): void {
  clearChat();
  identity = null;
  restoreVersion++;
}

function listenForInvalidation(): void {
  if (typeof window === "undefined" || eventTarget === window) return;
  eventTarget?.removeEventListener("kuska:unauthorized", forgetSession);
  eventTarget?.removeEventListener("kuska:account-deleted", forgetSession);
  eventTarget = window;
  eventTarget.addEventListener("kuska:unauthorized", forgetSession);
  eventTarget.addEventListener("kuska:account-deleted", forgetSession);
}

export async function restoreChat(): Promise<ChatSnapshot | null> {
  listenForInvalidation();
  const version = ++restoreVersion;
  let session;
  try {
    session = await getSecureSession();
  } catch {
    if (version === restoreVersion) forgetSession();
    return null;
  }
  // A logout event or a newer restoration must win over an older async read.
  if (version !== restoreVersion) return null;
  if (!session?.userId?.trim() || !session.accessToken?.trim()) {
    forgetSession();
    return null;
  }
  if (identity?.userId !== session.userId || identity.accessToken !== session.accessToken) {
    clearChat();
  }
  identity = { userId: session.userId, accessToken: session.accessToken };
  if (!snapshot) return null;
  if (Date.now() - savedAt >= MEMORY_TTL_MS || Date.now() < savedAt) {
    clearChat();
    return null;
  }
  return copySnapshot(snapshot);
}

export function saveChat(value: ChatSnapshot): void {
  if (!identity) return;
  snapshot = copySnapshot(value);
  savedAt = Date.now();
}
