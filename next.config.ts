import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    A BUILD CAN BE RUN WITHOUT KILLING A DEV SERVER.

    `next build` and `next dev` both write to .next, and a build performed while
    a dev server is running corrupts it — every route then 500s until the dev
    server is restarted and the directory cleared. That is fine when one person
    is working, and it means "verify the build" and "keep the app running" are
    mutually exclusive the moment two are.

    NEXT_DIST_DIR sends a verification build somewhere else:

        NEXT_DIST_DIR=.next-verify npm run build

    Unset — which is every normal build and every deploy — this is exactly the
    default, so nothing about the shipped output changes.

    ONE THING TO PUT BACK AFTERWARDS: Next appends its own type paths to
    tsconfig.json on every build, so a run with this set leaves
    ".next-verify/types/**" in `include` pointing at a directory that is about
    to be deleted. `git checkout tsconfig.json` after the build.
  */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
