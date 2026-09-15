import { z } from "zod";
import { Provenance, prov } from "./common";

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const FontChoice = z.object({
  /** Family actually used in the deck (must be a Google font or a safe system stack) */
  family: z.string(),
  googleUrl: z.string().optional(),
  /** Family found in the document when it differs from `family` */
  originalFamily: z.string().optional(),
});
export type FontChoice = z.infer<typeof FontChoice>;

/** Agent output for the design-system stage; also the Gate 1 edit form model. */
export const BrandDecision = z.object({
  orgName: z.string(),
  language: z.enum(["he", "en"]).default("he"),
  /**
   * `document` when the visual language was read off the source document;
   * `generic` when the document carried no brand signal and the neutral
   * house template was used instead.
   */
  basis: z.enum(["document", "generic"]).default("document"),
  colors: z.object({
    primary: prov(Hex),
    secondary: prov(Hex).optional(),
    accent: prov(Hex).optional(),
    neutralSeed: prov(Hex).optional(),
    mode: z.enum(["light", "dark"]),
  }),
  fonts: z.object({
    heading: prov(FontChoice),
    body: prov(FontChoice),
  }),
  logo: z.object({
    /** path relative to design-system/ (e.g. assets/logo/logo.png) */
    path: z.string().optional(),
    provenance: Provenance,
    background: z.enum(["light", "dark", "transparent"]),
    needsUpload: z.boolean().optional(),
    /** PDF fallback: crop from a rendered page (relative to extraction/) */
    cropFromPage: z
      .object({ page: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })
      .optional(),
  }),
  contentImages: z.array(
    z.object({ path: z.string(), caption: z.string(), page: z.number().optional() }),
  ),
  rationale: z.string(),
});
export type BrandDecision = z.infer<typeof BrandDecision>;

export const DsToken = z.object({
  name: z.string(),
  value: z.string(),
  kind: z.enum(["color", "font", "spacing", "radius", "shadow", "other"]),
  layer: z.enum(["primitive", "role"]),
  provenance: Provenance,
});

export const DsManifest = z.object({
  namespace: z.string(),
  brand: z.object({ name: z.string(), sourceFile: z.string(), language: z.enum(["he", "en"]) }),
  mode: z.enum(["light", "dark"]),
  tokens: z.array(DsToken),
  brandFonts: z.array(
    z.object({
      role: z.enum(["heading", "body"]),
      family: z.string(),
      status: z.enum(["google", "system_fallback"]),
      url: z.string().optional(),
    }),
  ),
  assets: z.object({ logo: z.string().optional(), images: z.array(z.string()) }),
  cards: z.array(z.object({ path: z.string(), group: z.string(), name: z.string() })),
  globalCssPaths: z.array(z.string()),
});
export type DsManifest = z.infer<typeof DsManifest>;
