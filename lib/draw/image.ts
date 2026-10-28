/**
 * lib/draw/image.ts
 *
 * WHAT   pickImage(): opens the browser's file chooser for an image, shrinks it (longest side 320 px, JPEG) so it
 *        stays small enough to save with the project, and remembers it; lastImage() returns the picked one.
 *        loadImage() does the same for a file the user already chose (Insert → PDF / Image: a site plan is kept
 *        sharper, 1600 px, so its property line can be traced), and queueImage() hands it to the next IMAGE
 *        tool so that tool does not ask for a file again.
 * FOR    The IMAGE tool in lib/draw/tools.ts (Insert → Media → Image) and the Import dialog.
 * DEBUG  - The chooser does not open: browsers only allow it from a click or key press; the IMAGE tool also asks
 *          again on the next click in the viewport.
 *        - The picture is blurry: it is stored at 320 px on purpose (projects are saved in localStorage).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */

/** An image ready to place: a small JPEG data URL, its pixel size and its file name. */
export interface PickedImage {
  src: string;
  w: number;
  h: number;
  name: string;
}

let last: PickedImage | null = null;
let queued: PickedImage | null = null;

/** The image picked most recently, or null. */
export const lastImage = (): PickedImage | null => last;

/** Make an image the one the next IMAGE tool places, without asking for a file. */
export function queueImage(img: PickedImage): void {
  last = img;
  queued = img;
}

/** The image queued by the Import dialog, once (null when there is none). */
export function takeQueued(): PickedImage | null {
  const q = queued;
  queued = null;
  return q;
}

/** Shrink an image file to `maxPx` on its longest side (JPEG on white). Resolves with null when it is not an image. */
export function loadImage(file: File, maxPx = 320): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k));
      const h = Math.max(1, Math.round(img.height * k));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!g) return resolve(null);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      resolve({ src: canvas.toDataURL("image/jpeg", 0.8), w, h, name: file.name });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Ask the user for an image file. Resolves with null when they cancel or the file is not an image. */
export function pickImage(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    // no page to show a file picker on (a headless test, the server): same as cancelling
    if (typeof document === "undefined") return resolve(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    input.setAttribute("data-testid", "image-input");
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      void loadImage(file).then((img) => {
        if (img) last = img;
        resolve(img);
      });
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}
