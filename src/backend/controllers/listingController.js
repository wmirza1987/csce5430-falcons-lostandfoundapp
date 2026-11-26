const listings = require("../repos/listings");
const {
  filesToImageNames,
  removeListingImages,
  storeListingImages,
} = require("../middleware/uploadMiddleware");
const {
  removeMatchesForListing,
  scheduleMatchRefresh,
} = require("../services/matchingService");
const { isGuid, isString, queryString } = require("../services/validation");

const MAX_PAGE_SIZE = 20;
const MAX_PAGE_NUMBER = 100000;

// Field rules mirror the old schema: [path label, required, max length].
const TEXT_RULES = {
  title: ["title", true, 100],
  category: ["category", true, null],
  brand: ["brand", false, 60],
  color: ["color", false, 40],
  description: ["description", true, 1000],
  building: ["location.building", true, null],
  zone: ["location.zone", false, null],
  privateDetails: ["privateDetails", false, 500],
};

function parseSearchDate(value, fieldName) {
  if (!value) {
    return { date: null };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { error: `${fieldName} must be a valid date.` };
  }

  return { date };
}

// Realm-safe date check (a Date from the database driver may come from another
// JavaScript realm, so instanceof is not reliable).
function isValidDate(value) {
  return Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime());
}

function logError(context, error) {
  console.error(`${context}: ${error.message}`);
}

// Validates a complete listing candidate and returns a list of messages (empty
// when valid). Every request-supplied value must be text, a date, or absent.
function validateListing(values) {
  const messages = [];

  if (values.type === undefined || values.type === null || values.type === "") {
    messages.push("Path `type` is required.");
  } else if (!isString(values.type) || !["lost", "found"].includes(values.type)) {
    messages.push(`\`${isString(values.type) ? values.type : "value"}\` is not a valid enum value for path \`type\`.`);
  }

  for (const [field, [label, required, maxLength]] of Object.entries(TEXT_RULES)) {
    const value = values[field];

    if (value === undefined || value === null) {
      if (required) {
        messages.push(`Path \`${label}\` is required.`);
      }

      continue;
    }

    if (!isString(value)) {
      messages.push(`Path \`${label}\` must be text.`);
      continue;
    }

    const trimmed = value.trim();

    if (required && trimmed === "") {
      messages.push(`Path \`${label}\` is required.`);
    } else if (maxLength && trimmed.length > maxLength) {
      messages.push(
        `Path \`${label}\` (\`${trimmed}\`) is longer than the maximum allowed length (${maxLength}).`
      );
    }
  }

  if (values.date === undefined || values.date === null || values.date === "") {
    messages.push("Path `date` is required.");
  } else if (!isValidDate(values.date)) {
    messages.push("Path `date` must be a valid date.");
  }

  if (values.type === "found" && (!values.images || values.images.length === 0)) {
    messages.push("Found-item listings must include at least one image.");
  }

  return messages;
}

// Converts the request's raw date value to a Date. Only strings are accepted;
// anything else is passed through unchanged so validateListing rejects it.
function toDate(value) {
  if (value === undefined || value === null || value === "") {
    return value;
  }

  return isString(value) ? new Date(value) : value;
}

function validationFailure(res, messages) {
  return res.status(400).json({
    message: messages.length > 0 ? messages.join(" ") : "Please check the submitted fields.",
  });
}

// FR-LIST-01, FR-LIST-02, FR-AUTH-01: create a Lost or Found listing.
// Requires a verified email before a listing can be created.
const createListing = async (req, res) => {
  try {
    if (!req.user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before creating a listing.",
      });
    }

    const body = req.body || {};
    const imageNames = filesToImageNames(req);

    const candidate = {
      type: body.type,
      title: body.title,
      category: body.category,
      brand: body.brand,
      color: body.color,
      description: body.description,
      date: toDate(body.date),
      building: body.building,
      zone: body.zone,
      privateDetails: body.privateDetails,
      images: imageNames,
    };

    const messages = validateListing(candidate);

    if (messages.length > 0) {
      return validationFailure(res, messages);
    }

    const images = await storeListingImages(req);
    let listing;

    try {
      listing = await listings.create(
        {
          type: candidate.type,
          title: candidate.title,
          category: candidate.category,
          brand: candidate.brand,
          color: candidate.color,
          description: candidate.description,
          date: candidate.date,
          location: { building: candidate.building, zone: candidate.zone },
          images,
          privateDetails: candidate.privateDetails,
          createdBy: req.user._id,
        },
        null,
        { includePrivate: true }
      );
    } catch (error) {
      await removeListingImages(images);
      throw error;
    }

    // FR-MATCH-01: matching runs in the background and never blocks creation.
    scheduleMatchRefresh(listing);

    return res.status(201).json({
      message: "Listing created successfully.",
      listing,
    });
  } catch (error) {
    logError("Unable to create listing", error);

    return res.status(400).json({
      message: "Please check the submitted fields.",
    });
  }
};

// FR-SRCH-01, FR-SRCH-02: public browse, search, and filter, paginated at 20 per page.
const getListings = async (req, res) => {
  try {
    const parsed = {};

    for (const name of [
      "search",
      "type",
      "category",
      "brand",
      "color",
      "building",
      "zone",
      "startDate",
      "endDate",
    ]) {
      const result = queryString(req.query[name]);

      if (result.error) {
        return res.status(400).json({
          message: `Query parameter ${name} must be a single text value.`,
        });
      }

      parsed[name] = result.value;
    }

    const start = parseSearchDate(parsed.startDate, "Start date");
    const end = parseSearchDate(parsed.endDate, "End date");

    if (start.error || end.error) {
      return res.status(400).json({
        message: start.error || end.error,
      });
    }

    if (start.date && end.date && start.date > end.date) {
      return res.status(400).json({
        message: "Start date must be before or equal to end date.",
      });
    }

    if (parsed.type && !["lost", "found"].includes(parsed.type)) {
      return res.status(400).json({
        message: "Type must be either lost or found.",
      });
    }

    const filters = {
      type: parsed.type,
      category: parsed.category,
      brand: parsed.brand,
      color: parsed.color,
      building: parsed.building,
      zone: parsed.zone,
      startDate: start.date,
      endDate: end.date,
      search: parsed.search.trim(),
    };

    const pageNumber = Math.min(
      Math.max(parseInt(isString(req.query.page) ? req.query.page : "1", 10) || 1, 1),
      MAX_PAGE_NUMBER
    );
    const pageSize = Math.min(
      Math.max(parseInt(isString(req.query.limit) ? req.query.limit : "20", 10) || MAX_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );

    const { total, listings: rows } = await listings.search(filters, {
      page: pageNumber,
      pageSize,
    });

    return res.status(200).json({
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
      listings: rows,
    });
  } catch (error) {
    logError("Unable to retrieve listings", error);

    return res.status(500).json({
      message: "Unable to retrieve listings.",
    });
  }
};

// Fetches one listing by id directly, instead of requiring the caller to
// page through the full list. Private details are included only for the
// listing's own owner, consistent with FR-LIST-04 and NFR-PRIV-01.
const getListingById = async (req, res) => {
  try {
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    const listing = await listings.findById(req.params.id, {
      includePrivate: true,
      populateCreator: true,
    });

    // The listing is checked for null before anything on it is read.
    if (!listing) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    const isOwner = Boolean(
      req.user && listing.createdBy && listing.createdBy._id === req.user._id
    );

    // FR-ADM-01: hidden listings leave public views. The owner may still see
    // their own listing; everyone else gets a not-found response.
    if (listing.isDeleted || (listing.isHidden && !isOwner)) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    if (!isOwner) {
      delete listing.privateDetails;
    }

    return res.status(200).json({ listing });
  } catch (error) {
    logError("Unable to retrieve listing", error);

    return res.status(500).json({
      message: "Unable to retrieve this listing.",
    });
  }
};

// FR-LIST-03: only the owner may edit their own Active listing.
const updateListing = async (req, res) => {
  try {
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    const listing = await listings.findById(req.params.id, { includePrivate: true });

    if (!listing || listing.isDeleted) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    if (listing.createdBy !== req.user._id) {
      return res.status(403).json({
        message: "You can only edit your own listings.",
      });
    }

    if (listing.status !== "active") {
      return res.status(409).json({
        message: "Only an active listing can be edited.",
      });
    }

    const body = req.body || {};
    const changes = {};

    for (const field of ["title", "category", "brand", "color", "description", "privateDetails"]) {
      if (body[field] !== undefined) {
        changes[field] = body[field];
      }
    }

    if (body.date !== undefined) {
      changes.date = toDate(body.date);
    }

    if (body.building !== undefined || body.zone !== undefined) {
      changes.building = body.building ?? listing.location?.building;
      changes.zone = body.zone ?? listing.location?.zone;
    }

    const newImageNames = filesToImageNames(req);

    if (newImageNames.length > 0) {
      changes.images = newImageNames;
    }

    const merged = {
      type: listing.type,
      title: listing.title,
      category: listing.category,
      brand: listing.brand,
      color: listing.color,
      description: listing.description,
      date: listing.date,
      building: listing.location?.building,
      zone: listing.location?.zone,
      privateDetails: listing.privateDetails,
      images: listing.images,
      ...changes,
    };

    const messages = validateListing(merged);

    if (messages.length > 0) {
      return validationFailure(res, messages);
    }

    let storedImages = [];

    if (newImageNames.length > 0) {
      storedImages = await storeListingImages(req);
    }

    let updated;

    try {
      updated = await listings.update(listing._id, changes, { includePrivate: true });
    } catch (error) {
      await removeListingImages(storedImages);
      throw error;
    }

    if (storedImages.length > 0) {
      // The replaced photos are no longer referenced; drop them from storage.
      const replaced = (listing.images || []).map((url) => String(url).split("/").pop());
      await removeListingImages(replaced);
    }

    // FR-MATCH-02: suggestions are recomputed after every edit, in the background.
    scheduleMatchRefresh(updated);

    return res.status(200).json({
      message: "Listing updated successfully.",
      listing: updated,
    });
  } catch (error) {
    logError("Unable to update listing", error);

    return res.status(400).json({
      message: "Please check the submitted fields.",
    });
  }
};

// FR-LIST-03: soft delete, preserving the record rather than removing it.
const deleteListing = async (req, res) => {
  try {
    if (!isGuid(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    const listing = await listings.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    if (listing.createdBy !== req.user._id) {
      return res.status(403).json({
        message: "You can only delete your own listings.",
      });
    }

    if (listing.status !== "active") {
      return res.status(409).json({
        message: "Only an active listing can be deleted.",
      });
    }

    await listings.softDelete(listing._id);

    await removeMatchesForListing(listing._id).catch((error) => {
      logError("Unable to remove matches after listing deletion", error);
    });

    return res.status(200).json({
      message: "Listing deleted successfully.",
    });
  } catch (error) {
    logError("Unable to delete listing", error);

    return res.status(500).json({
      message: "Unable to delete listing.",
    });
  }
};

module.exports = {
  createListing,
  getListings,
  getListingById,
  updateListing,
  deleteListing,
};
