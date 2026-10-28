const {
  calculateMatchDetails,
  calculateMatchScore,
  calculateKeywordScore,
  refreshMatchesForListing,
} = require("../services/matchingService");
const Match = require("../models/Match");
const { createListing, createUser } = require("./helpers");

describe("Matching Service", () => {
  test("returns 100 for a strong match", () => {
    const lostListing = {
      title: "Black Apple AirPods",
      description: "Lost black AirPods near library",
      category: "Electronics",
      date: "2026-10-01",
      location: {
        building: "Willis",
      },
    };

    const foundListing = {
      title: "Apple AirPods Found",
      description: "Found black AirPods inside library",
      category: "Electronics",
      date: "2026-10-02",
      location: {
        building: "Willis",
      },
    };

    expect(calculateMatchScore(lostListing, foundListing)).toBe(100);
  });

  test("returns the contributing factors for a match", () => {
    const details = calculateMatchDetails(
      {
        title: "Black AirPods",
        description: "Lost black AirPods near library",
        category: "Electronics",
        date: "2026-10-01",
        location: { building: "Willis", zone: "North Campus" },
      },
      {
        title: "Found AirPods",
        description: "Found black AirPods in library",
        category: "Electronics",
        date: "2026-10-01",
        location: { building: "Willis", zone: "North Campus" },
      }
    );

    expect(details.score).toBe(100);
    expect(details.factors.category.points).toBe(35);
    expect(details.factors.date.points).toBe(25);
    expect(details.factors.location.points).toBe(20);
    expect(details.factors.keywords.points).toBe(20);
    expect(details.factors.keywords.shared).toEqual(
      expect.arrayContaining(["airpod", "black", "library"])
    );
    expect(details.explanation.length).toBeGreaterThanOrEqual(4);
  });

  test("returns 20 when three or more keywords match", () => {
    const lostListing = {
      title: "Black Apple AirPods",
      description: "Lost near library",
      category: "Electronics",
    };

    const foundListing = {
      title: "Black Apple AirPods",
      description: "Found near library",
      category: "Electronics",
    };

    expect(calculateKeywordScore(lostListing, foundListing)).toBe(20);
  });

  test("returns 0 when listings have no matching information", () => {
    const lostListing = {
      title: "Wallet",
      category: "Personal",
    };

    const foundListing = {
      title: "Laptop",
      category: "Electronics",
    };

    expect(calculateMatchScore(lostListing, foundListing)).toBe(0);
  });

  test("persists only suggestions at or above the 65-point threshold", async () => {
    const owner = await createUser();

    const lost = await createListing(owner, {
      type: "lost",
      title: "Black AirPods",
      description: "Lost black AirPods near Willis Library",
      date: new Date("2026-10-01"),
    });

    const found = await createListing(owner, {
      type: "found",
      title: "Found AirPods",
      description: "Found black AirPods in Willis Library",
      date: new Date("2026-10-01"),
    });

    const weakFound = await createListing(owner, {
      type: "found",
      title: "Blue Umbrella",
      category: "Other",
      description: "Found a blue umbrella",
      date: new Date("2026-10-20"),
      location: { building: "Union", zone: "South Campus" },
    });

    const result = await refreshMatchesForListing(lost._id);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBeGreaterThanOrEqual(65);
    expect(result.matches[0].lostListing.toString()).toBe(lost._id.toString());
    expect(result.matches[0].foundListing.toString()).toBe(found._id.toString());
    expect(result.newMatches).toHaveLength(1);

    const stored = await Match.find({});
    expect(stored).toHaveLength(1);
    expect(stored[0].factors.category.points).toBe(35);
    expect(stored[0].factors.keywords.shared.length).toBeGreaterThanOrEqual(3);
    expect(weakFound._id).toBeDefined();
  });
});
