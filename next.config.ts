import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist is deliberately absent: its worker is ESM and Next refuses to
  // externalise it. Extraction runs in a child process instead (lib/extract/run.ts).
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "playwright", "sharp", "jszip"],
};

export default nextConfig;
