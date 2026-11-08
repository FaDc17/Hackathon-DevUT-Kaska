import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ native: false, save: vi.fn(), remove: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => bridge.native,
    convertFileSrc: (uri: string) =>
      `https://localhost/_capacitor_file_${uri.slice("file://".length)}`,
  },
  registerPlugin: () => ({ save: bridge.save, remove: bridge.remove }),
}));
import {
  browserImage,
  isRemoteImage,
  persistSelectedImage,
  removeBrowserImage,
  removePersistentImage,
  saveBrowserImage,
} from "./images";

const imageData = "data:image/png;base64,iVBORw0KGgo=";
beforeEach(() => {
  bridge.native = false;
  bridge.save.mockReset();
  bridge.remove.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal(
    "FileReader",
    class {
      result: string | null = null;
      onload?: () => void;
      readAsDataURL() {
        this.result = imageData;
        this.onload?.();
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("image persistence contracts (native bridge and browser storage simulated)", () => {
  it("keeps a selected browser file as a Data URI and recovers it after module reload", async () => {
    const value = await persistSelectedImage(
      { type: "image/png", size: 8 } as File,
      "image-original-id",
    );
    saveBrowserImage("service", "service-original-id", value);
    vi.resetModules();
    const reloaded = await import("./images");
    expect(reloaded.browserImage("service", "service-original-id")).toBe(imageData);
    expect(bridge.save).not.toHaveBeenCalled();
  });

  it("uses private Android file storage and never treats its WebView URL as a remote upload", async () => {
    bridge.native = true;
    bridge.save.mockResolvedValue({
      uri: "file:///data/user/0/com.kuska.app/files/kuska-images/image-original-id.png",
    });
    const value = await persistSelectedImage(
      { type: "image/png", size: 8 } as File,
      "image-original-id",
    );
    expect(bridge.save).toHaveBeenCalledWith({ id: "image-original-id", dataUrl: imageData });
    expect(value).toBe(
      "https://localhost/_capacitor_file_/data/user/0/com.kuska.app/files/kuska-images/image-original-id.png",
    );
    expect(isRemoteImage(value)).toBe(false);
  });

  it("does not claim that a photo was saved when the native bridge rejects it", async () => {
    bridge.native = true;
    bridge.save.mockRejectedValue(new Error("No se pudo guardar la fotografía en el teléfono."));
    await expect(persistSelectedImage(imageData, "image-original-id")).rejects.toThrow(
      "No se pudo guardar",
    );
  });

  it("keeps browser image references separate when content IDs coincide across modules", () => {
    saveBrowserImage("service", "same-id", imageData);
    saveBrowserImage("post", "same-id", "data:image/png;base64,b3RoZXI=");
    removeBrowserImage("service", "same-id");
    expect(browserImage("service", "same-id")).toBeNull();
    expect(browserImage("post", "same-id")).toBe("data:image/png;base64,b3RoZXI=");
  });

  it("reports browser storage quota failure instead of silently losing a selected photo", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => saveBrowserImage("post", "post-id", imageData)).toThrow("No hay espacio");
  });

  it("never sends a remote image URL to the native file-removal bridge", async () => {
    bridge.native = true;
    await removePersistentImage("https://example.com/published-image.png");
    expect(bridge.remove).not.toHaveBeenCalled();
  });
});
