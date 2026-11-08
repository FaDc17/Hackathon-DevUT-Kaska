import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { compressImage, MAX_IMAGE_BYTES } from "./imageCompression";

const state = { close: vi.fn(), draw: vi.fn(), output: new Blob(), canvas: { width: 0, height: 0, getContext: vi.fn(), toBlob: vi.fn() } };
beforeEach(() => {
  vi.clearAllMocks();
  state.output = new Blob([new Uint8Array(300_000)], { type: "image/jpeg" });
  state.canvas.getContext.mockReturnValue({ drawImage: state.draw });
  state.canvas.toBlob.mockImplementation((callback: (blob: Blob) => void) => callback(state.output));
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: state.close }));
  vi.stubGlobal("document", { createElement: () => state.canvas });
});
afterEach(() => vi.unstubAllGlobals());

it("reduces a four-megabyte phone photo to 1280 pixels before persistence or upload", async () => {
  const input = new Blob([new Uint8Array(4 * 1024 * 1024)], { type: "image/jpeg" });
  const output = await compressImage(input);
  expect(output).toBe(state.output);
  expect(state.canvas.width).toBe(1280); expect(state.canvas.height).toBe(960);
  expect(state.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.7);
  expect(state.close).toHaveBeenCalledOnce();
});
it("accepts an eight-megabyte photo and rejects an original larger than ten before decoding", async () => {
  await expect(compressImage(new Blob([new Uint8Array(8 * 1024 * 1024)], { type: "image/jpeg" }))).resolves.toBe(state.output);
  vi.mocked(createImageBitmap).mockClear();
  await expect(compressImage(new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: "image/jpeg" }))).rejects.toThrow("hasta 10 MB");
  expect(createImageBitmap).not.toHaveBeenCalled();
});
it("keeps small images unchanged and never enlarges an optimized original", async () => {
  const small = new Blob([new Uint8Array(100)], { type: "image/png" });
  expect(await compressImage(small)).toBe(small);
  expect(createImageBitmap).not.toHaveBeenCalled();
  const original = new Blob([new Uint8Array(800_000)], { type: "image/jpeg" });
  state.output = new Blob([new Uint8Array(900_000)], { type: "image/jpeg" });
  expect(await compressImage(original)).toBe(original);
});
it("retains transparent formats and releases decoding resources when encoding fails", async () => {
  state.canvas.toBlob.mockImplementation((callback: (blob: Blob | null) => void) => callback(null));
  await expect(compressImage(new Blob([new Uint8Array(800_000)], { type: "image/png" }))).rejects.toThrow("comprimir");
  expect(state.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.7);
  expect(state.close).toHaveBeenCalledOnce();
});
