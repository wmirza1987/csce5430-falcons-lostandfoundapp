function getKeywords(listing) {
  const text = [
    listing.title,
    listing.description,
    listing.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text
    .split(/\W+/)
    .filter((word) => word.length > 2);
}

function calculateKeywordScore(lostListing, foundListing) {
  const lostKeywords = new Set(getKeywords(lostListing));
  const foundKeywords = new Set(getKeywords(foundListing));

  let sharedCount = 0;

  for (const word of lostKeywords) {
    if (foundKeywords.has(word)) {
      sharedCount++;
    }
  }

  if (sharedCount >= 3) {
    return 20;
  }

  if (sharedCount >= 1) {
    return 10;
  }

  return 0;
}

function calculateMatchScore(lostListing, foundListing) {
  let score = 0;

  if (!lostListing || !foundListing) {
    return score;
  }

  // Category match
  if (
    lostListing.category &&
    foundListing.category &&
    lostListing.category.toLowerCase() === foundListing.category.toLowerCase()
  ) {
    score += 35;
  }

  // Date proximity
  if (lostListing.date && foundListing.date) {
    const lostDate = new Date(lostListing.date);
    const foundDate = new Date(foundListing.date);

    const differenceInTime = Math.abs(lostDate - foundDate);
    const differenceInDays = differenceInTime / (1000 * 60 * 60 * 24);

    if (differenceInDays <= 1) {
      score += 25;
    } else if (differenceInDays <= 7) {
      score += 15;
    }
  }

  // Location match
  const lostBuilding = lostListing.location?.building;
  const foundBuilding = foundListing.location?.building;

  const lostZone = lostListing.location?.zone;
  const foundZone = foundListing.location?.zone;

  if (
    lostBuilding &&
    foundBuilding &&
    lostBuilding.toLowerCase() === foundBuilding.toLowerCase()
  ) {
    score += 20;
  } else if (
    lostZone &&
    foundZone &&
    lostZone.toLowerCase() === foundZone.toLowerCase()
  ) {
    score += 10;
  }

  // Shared public keywords
  score += calculateKeywordScore(lostListing, foundListing);

  return score;
}

module.exports = {
  calculateMatchScore,
  calculateKeywordScore,
};