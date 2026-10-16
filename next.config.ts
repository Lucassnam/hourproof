import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Without this, Next walks up from this file looking for a lockfile and finds
  // ~/package-lock.json outside the git repo, and warns that it's ignoring it — see
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md.
  turbopack: {
    root: __dirname,
  },
  // `next dev` logs every Server Function call with its arguments by default. The kitchen
  // poster's actions take the kitchen PIN as an argument, so that log would print it.
  // See node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/logging.md.
  logging: {
    serverFunctions: false,
  },
  // Security headers on every response. There is no script-src policy: Next's inline
  // scripts and the theme boot script would each need a per-request nonce (a proxy.ts),
  // and nothing here restricts scripts. What these do:
  // - no other site can frame the app (the kitchen PIN page in particular);
  // - /k/<code> URLs carry a kitchen's check-in code, and Referrer-Policy keeps them from
  //   being sent to any other origin (Supabase included);
  // - the app uses no camera, microphone, location or payments, so it can't be asked to.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
