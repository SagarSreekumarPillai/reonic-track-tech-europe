import { describe, expect, it } from "vitest";
import { appleMapsSearchUrl, googleMapsSearchUrl, siteMapsQuery } from "./maps-links";

describe("maps-links", () => {
  it("returns null when site is empty", () => {
    expect(siteMapsQuery({})).toBeNull();
    expect(siteMapsQuery({ siteAddress: "   " })).toBeNull();
  });

  it("builds Apple and Google search URLs", () => {
    const q = "Berlin Hauptbahnhof";
    expect(appleMapsSearchUrl(q)).toBe("https://maps.apple.com/?q=Berlin%20Hauptbahnhof");
    expect(googleMapsSearchUrl(q)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Berlin%20Hauptbahnhof"
    );
  });
});
