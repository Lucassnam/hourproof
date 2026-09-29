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
};

export default withNextIntl(nextConfig);
