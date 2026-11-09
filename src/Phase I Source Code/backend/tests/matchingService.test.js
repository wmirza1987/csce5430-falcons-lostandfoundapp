const {
  calculateMatchScore,
  calculateKeywordScore,
} = require("../services/matchingService");

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

    const score = calculateMatchScore(lostListing, foundListing);

    expect(score).toBe(100);
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

    const score = calculateKeywordScore(lostListing, foundListing);

    expect(score).toBe(20);
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

    const score = calculateMatchScore(lostListing, foundListing);

    expect(score).toBe(0);
  });
});