const Listing = require("../models/Listing");
const Match = require("../models/Match");
const {
  calculateMatchDetails,
  refreshMatchesForListing,
  WEIGHTS,
} = require("../services/matchingService");
const { createListing, createUser } = require("./helpers");

const day = (iso) => new Date(iso);

function listing(overrides = {}) {
  return {
    type: "lost",
    title: "Black AirPods",
    category: "Electronics",
    brand: "Apple",
    color: "Black",
    description: "Lost black AirPods near the library",
    date: day("2026-10-01"),
    location: { building: "Willis Library", zone: "North Campus" },
    ...overrides,
  };
}

describe("Scoring components (FR-MATCH-01)", () => {
  test("UT-MATCH-01: an exact category match contributes the category weight", () => {
    const { factors } = calculateMatchDetails(listing({ type: "lost" }), listing({ type: "found" }));
    expect(factors.category.points).toBe(WEIGHTS.category);
  });

  test("UT-MATCH-02: a shared building contributes the full location weight", () => {
    const { factors } = calculateMatchDetails(listing(), listing({ type: "found" }));
    expect(factors.location.points).toBe(WEIGHTS.location);
    expect(factors.location.basis).toBe("same building");
  });

  test("UT-MATCH-03: items one day apart contribute the full date weight", () => {
    const { factors } = calculateMatchDetails(
      listing(),
      listing({ type: "found", date: day("2026-10-02") })
    );
    expect(factors.date.points).toBe(WEIGHTS.date);
    expect(factors.date.daysApart).toBe(1);
  });

  test("UT-MATCH-04: three shared keywords contribute the full keyword weight", () => {
    const lost = listing({ description: "Black leather wallet with cards", title: "Wallet" });
    const found = listing({ type: "found", description: "Found black leather wallet with cards", title: "Wallet" });
    const { factors } = calculateMatchDetails(lost, found);

    expect(factors.keywords.points).toBe(WEIGHTS.keywords);
    expect(factors.keywords.shared.length).toBeGreaterThanOrEqual(3);
  });

  test("UT-MATCH-05: the composite score is the weighted sum of the components", () => {
    const { score } = calculateMatchDetails(
      listing(),
      listing({ type: "found", date: day("2026-09-01"), location: { building: "Other Hall" }, description: "Silver ring" })
    );

    // Category matches, dates are 30 days apart, buildings differ, and the title,
    // brand, and color still share three keywords, so only those two components count.
    expect(score).toBe(WEIGHTS.category + WEIGHTS.keywords);
  });

  test("UT-MATCH-06: a category mismatch removes the category contribution", () => {
    const { factors } = calculateMatchDetails(listing(), listing({ type: "found", category: "Keys" }));
    expect(factors.category.points).toBe(0);
  });

  test("UT-MATCH-07: a different building removes the building contribution", () => {
    const { factors } = calculateMatchDetails(
      listing({ location: { building: "Willis Library" } }),
      listing({ type: "found", location: { building: "Union" } })
    );
    expect(factors.location.points).toBe(0);
  });

  test("UT-MATCH-08: items 30 days apart contribute no date weight", () => {
    const { factors } = calculateMatchDetails(
      listing(),
      listing({ type: "found", date: day("2026-10-31") })
    );
    expect(factors.date.points).toBe(0);
  });

  test("UT-MATCH-09: no shared keywords contributes nothing", () => {
    const { factors } = calculateMatchDetails(
      listing({ title: "Umbrella", description: "Blue umbrella", brand: "", color: "" }),
      listing({ type: "found", title: "Notebook", description: "Spiral notebook", brand: "", color: "" })
    );
    expect(factors.keywords.points).toBe(0);
  });

  test("UT-MATCH-14: a lost listing with no found candidates produces no matches", async () => {
    const owner = await createUser();
    const lost = await createListing(owner, { type: "lost" });

    const result = await refreshMatchesForListing(lost);

    expect(result.matches).toHaveLength(0);
    expect(await Match.countDocuments({})).toBe(0);
  });
});

describe("Refresh and threshold (FR-MATCH-01, FR-MATCH-02)", () => {
  test("persists only pairs at or above the 0.6 threshold", async () => {
    const owner = await createUser();
    const finder = await createUser();
    const lost = await createListing(owner, { type: "lost" });
    const strong = await createListing(finder, { type: "found", title: "Black AirPods case" });
    await createListing(finder, {
      type: "found",
      title: "Red scarf",
      description: "Red wool scarf",
      category: "Clothing",
      location: { building: "Union" },
      date: day("2026-09-01"),
      brand: "",
      color: "",
    });

    const result = await refreshMatchesForListing(lost);

    expect(result.matches).toHaveLength(1);
    expect(String(result.matches[0].foundListing)).toBe(String(strong._id));
    expect(result.matches[0].score).toBeGreaterThanOrEqual(0.6);
  });

  test("removes a match when the listing changes and no longer qualifies (FR-MATCH-02)", async () => {
    const owner = await createUser();
    const finder = await createUser();
    const lost = await createListing(owner, { type: "lost" });
    const found = await createListing(finder, { type: "found" });
    await refreshMatchesForListing(lost);
    expect(await Match.countDocuments({})).toBe(1);

    found.category = "Keys";
    found.location = { building: "Union" };
    found.date = day("2026-11-01");
    found.title = "Keys";
    found.description = "Set of keys";
    found.brand = "";
    found.color = "";
    await found.save();
    await refreshMatchesForListing(found);

    expect(await Match.countDocuments({})).toBe(0);
  });

  test("a deleted listing has its matches removed", async () => {
    const owner = await createUser();
    const finder = await createUser();
    const lost = await createListing(owner, { type: "lost" });
    const found = await createListing(finder, { type: "found" });
    await refreshMatchesForListing(lost);

    await Listing.updateOne({ _id: found._id }, { $set: { isDeleted: true } });
    await refreshMatchesForListing(await Listing.findById(found._id));

    expect(await Match.countDocuments({})).toBe(0);
  });
});
