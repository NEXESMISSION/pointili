import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Next infer the wrong
  // workspace root. Pin it to this project.
  turbopack: {
    root: __dirname,
  },
  // The dev badge defaults to bottom-left, directly on top of the app's bottom
  // nav (dev only, but it makes the nav unreviewable). Move it out of the way.
  devIndicators: {
    position: "top-right",
  },
};

export default nextConfig;
