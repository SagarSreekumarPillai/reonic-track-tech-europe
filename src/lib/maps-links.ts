/**
 * Build universal map search URLs (address, place name, or "lat,lng").
 * Apple: https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 * Google: https://developers.google.com/maps/documentation/urls/get-started#search-action
 */
export function siteMapsQuery(profile: { siteAddress?: string }): string | null {
  const q = profile.siteAddress?.trim();
  return q && q.length > 0 ? q : null;
}

export function appleMapsSearchUrl(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
