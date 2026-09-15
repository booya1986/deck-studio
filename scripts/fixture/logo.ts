import sharp from "sharp";
import { BRAND } from "./content";

/** A shape-only mark (no text, so it renders identically everywhere) plus a latin wordmark. */
export function logoSvg(opts: { withText?: boolean } = {}): string {
  const { primary, accent } = BRAND;
  const text = opts.withText === false ? "" : `
    <text x="150" y="98" font-family="Helvetica, Arial, sans-serif" font-size="46"
          font-weight="700" letter-spacing="2" fill="#${primary}">OFEK</text>
    <text x="150" y="128" font-family="Helvetica, Arial, sans-serif" font-size="17"
          letter-spacing="6" fill="#${accent}">BANK</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="160" viewBox="0 0 420 160">
  <rect width="420" height="160" fill="none"/>
  <g transform="translate(20,20)">
    <rect x="0" y="0" width="112" height="112" rx="26" fill="#${primary}"/>
    <path d="M18 76 A38 38 0 0 1 94 76" fill="none" stroke="#${accent}" stroke-width="11" stroke-linecap="round"/>
    <circle cx="56" cy="76" r="13" fill="#FFFFFF"/>
    <rect x="18" y="90" width="76" height="7" rx="3.5" fill="#FFFFFF" opacity="0.92"/>
  </g>${text}
</svg>`;
}

export async function logoPng(width = 420): Promise<Buffer> {
  return sharp(Buffer.from(logoSvg())).resize({ width }).png().toBuffer();
}
