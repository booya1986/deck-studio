import path from "node:path";

export type ImageCandidate = {
  path: string;
  w: number;
  h: number;
  page?: number;
  inHeader: boolean;
  onMaster: boolean;
  format: string;
  convertible: boolean;
  /** how many distinct pages/slides this image appears on */
  occurrences?: number;
};

/** Formats we can actually load and re-emit. EMF/WMF need a converter we do not have. */
export const UNCONVERTIBLE = new Set(["emf", "wmf", "wdp", "tiff", "tif"]);

export function formatOf(file: string): string {
  return path.extname(file).replace(".", "").toLowerCase() || "bin";
}

const LOGO_NAME = /logo|לוגו|brand|mark|emblem|סמל/i;

/**
 * Heuristic 0..1 score for "this image is the organisation's logo".
 * Header/master placement and a wide-but-short aspect ratio dominate.
 */
export function scoreLogo(img: ImageCandidate): number {
  let s = 0;
  if (img.inHeader) s += 0.35;
  if (img.onMaster) s += 0.3;

  const aspect = img.h > 0 ? img.w / img.h : 0;
  if (aspect >= 0.8 && aspect <= 6.5) s += 0.2;
  if (aspect >= 1.5 && aspect <= 5) s += 0.08;

  const area = img.w * img.h;
  if (area > 0 && area < 400_000) s += 0.12;
  if (area > 1_400_000) s -= 0.2;

  const fmt = img.format.toLowerCase();
  if (fmt === "svg") s += 0.12;
  else if (fmt === "png") s += 0.08;
  else if (fmt === "jpg" || fmt === "jpeg") s -= 0.05;

  if ((img.occurrences ?? 1) >= 2) s += 0.15;
  if (LOGO_NAME.test(path.basename(img.path))) s += 0.25;
  if (img.page === 1) s += 0.05;
  if (!img.convertible) s -= 0.3;

  return Math.max(0, Math.min(1, Number(s.toFixed(3))));
}

export function rankLogos<T extends ImageCandidate>(images: T[]): (T & { logoScore: number })[] {
  return images
    .map((i) => ({ ...i, logoScore: scoreLogo(i) }))
    .sort((a, b) => b.logoScore - a.logoScore);
}
