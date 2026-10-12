import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next.js 16 only serves listed qualities. 90 is for heroes and key art (see craft/images.md).
    qualities: [75, 90],
  },
};

export default nextConfig;
