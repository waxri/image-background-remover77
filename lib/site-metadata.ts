export function canonicalUrl(pathname: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredSiteUrl) return undefined;
  try {
    return new URL(pathname, configuredSiteUrl).toString();
  } catch {
    return undefined;
  }
}
