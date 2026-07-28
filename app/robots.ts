import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * robots.txt
 *
 * AI CRAWLERS ARE WELCOME, deliberately. The common 2026 posture is to block
 * training bots (GPTBot, ClaudeBot, Google-Extended) while allowing the
 * search-time ones — that protects a publisher whose content IS the product.
 * Pointili is the opposite case: nobody is going to steal a loyalty programme by
 * reading about it, and being *explained correctly* by an assistant to a café
 * owner who asked "how do I do loyalty in Tunisia" is worth more than any
 * backlink. So everything public is open to everything.
 *
 * What IS closed is the part that is nobody's business: the till, the console,
 * a diner's wallet, and the whole business subdomain. Those are behind auth
 * anyway — this just stops crawlers wasting requests on redirects and stops a
 * login screen ever appearing in a result.
 */
export default function robots(): MetadataRoute.Robots {
  const off = [
    "/owner",      // the till and everything under it
    "/owner/",
    "/admin",      // the platform console
    "/admin/",
    "/cartes",     // a diner's own wallet
    "/moi",        // a sign-in form has no business in an index
    "/api/",
    "/auth/",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: off },
      /*
        Named explicitly rather than relying on the wildcard. Several of these
        ignore "*" when a specific record exists, and being listed by name is
        also the clearest possible signal of intent if the policy is ever
        questioned.
      */
      { userAgent: "GPTBot", allow: "/", disallow: off },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: off },
      { userAgent: "ChatGPT-User", allow: "/", disallow: off },
      { userAgent: "ClaudeBot", allow: "/", disallow: off },
      { userAgent: "Claude-User", allow: "/", disallow: off },
      { userAgent: "Claude-SearchBot", allow: "/", disallow: off },
      { userAgent: "PerplexityBot", allow: "/", disallow: off },
      { userAgent: "Perplexity-User", allow: "/", disallow: off },
      { userAgent: "Google-Extended", allow: "/", disallow: off },
      { userAgent: "Applebot-Extended", allow: "/", disallow: off },
      { userAgent: "CCBot", allow: "/", disallow: off },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
