import type { NextConfig } from "next";

/*
  WHICH BUILD THIS IS — the one string the running app can compare itself to.

  A browser never reuses a Pointili page: every HTML response is `no-store`. So
  a NAVIGATION always gets the new deploy. What does not is a tab that is
  already open — and after the first load this app is a single page, so the till
  a shop leaves running behind the counter, and an installed PWA window that is
  never closed, go on executing the JavaScript they launched with. For days.

  That is the "cache problem" people report, and it has a sharp edge: the next
  deploy DELETES the content-hashed chunks the old bundle still expects, so the
  first screen that needs one dies with a ChunkLoadError — a blank or broken
  page that a hard refresh fixes and nothing else does.

  `env` here is a BUILD-TIME substitution: every `process.env.NEXT_PUBLIC_BUILD_ID`
  in the source, on the client AND on the server, is replaced by this literal
  while the bundle is compiled. That is exactly the property the check needs —
  the browser holds the id of the build it downloaded, /api/version answers with
  the id of the build that is serving now, and they differ only when there has
  been a deploy. Nothing reads it at runtime, so `next start` re-evaluating this
  file with a different Date.now() changes nothing.

  A commit SHA when the platform offers one, because it is stable across a
  rebuild of the same code; a timestamp otherwise.
*/
const BUILD_ID =
  process.env.BUILD_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.RENDER_GIT_COMMIT ??
  process.env.GITHUB_SHA ??
  String(Date.now());

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
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
