const Listing = require("../models/Listing");
const { filesToImageUrls } = require("../middleware/uploadMiddleware");
const {
  refreshMatchesForListing,
  removeMatchesForListing,
} = require("../services/matchingService");

const MAX_PAGE_SIZE = 20;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function validationMessage(error) {
  if (error?.name === "ValidationError") {
    return Object.values(error.errors)
      .map((item) => item.message)
      .join(" ");
  }

  return "Please check the submitted fields.";
}

function logError(context, error) {
  console.error(`${context}: ${error.message}`);
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

    const {
      type,
      title,
      category,
      brand,
      color,
      description,
      date,
      building,
      zone,
      privateDetails,
    } = req.body;

    const images = filesToImageUrls(req);

    const listing = await Listing.create({
      type,
      title,
      category,
      brand,
      color,
      description,
      date,
      location: { building, zone },
      images,
      privateDetails,
      createdBy: req.user._id,
    });

    await refreshMatchesForListing(listing).catch((error) => {
      logError("Unable to refresh matches after listing creation", error);
    });

    return res.status(201).json({
      message: "Listing created successfully.",
      listing,
    });
  } catch (error) {
    logError("Unable to create listing", error);

    return res.status(400).json({
      message: validationMessage(error),
    });
  }
};

// FR-SRCH-01, FR-SRCH-02: public browse, search, and filter, paginated at 20 per page.
const getListings = async (req, res) => {
  try {
    const {
      search,
      type,
      category,
      brand,
      color,
      building,
      zone,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const start = parseSearchDate(startDate, "Start date");
    const end = parseSearchDate(endDate, "End date");

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

    const query = {
      isDeleted: false,
      status: "active",
    };

    if (type) {
      if (!["lost", "found"].includes(type)) {
        return res.status(400).json({
          message: "Type must be either lost or found.",
        });
      }

      query.type = type;
    }

    if (category) {
      query.category = { $regex: new RegExp(`^${escapeRegExp(category)}$`, "i") };
    }

    if (brand) {
      query.brand = { $regex: new RegExp(`^${escapeRegExp(brand)}$`, "i") };
    }

    if (color) {
      query.color = { $regex: new RegExp(`^${escapeRegExp(color)}$`, "i") };
    }

    if (building) {
      query["location.building"] = {
        $regex: new RegExp(`^${escapeRegExp(building)}$`, "i"),
      };
    }

    if (zone) {
      query["location.zone"] = {
        $regex: new RegExp(`^${escapeRegExp(zone)}$`, "i"),
      };
    }

    if (start.date || end.date) {
      query.date = {};

      if (start.date) {
        query.date.$gte = start.date;
      }

      if (end.date) {
        query.date.$lte = end.date;
      }
    }

    if (search && String(search).trim()) {
      const term = escapeRegExp(String(search).trim());

      query.$or = [
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { category: { $regex: term, $options: "i" } },
        { brand: { $regex: term, $options: "i" } },
        { color: { $regex: term, $options: "i" } },
      ];
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(limit, 10) || MAX_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );

    const total = await Listing.countDocuments(query);

    const listings = await Listing.find(query)
      .populate("createdBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.status(200).json({
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
      listings,
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
    const listing = await Listing.findById(req.params.id)
      .select("+privateDetails")
      .populate("createdBy", "firstName lastName");

    if (!listing || listing.isDeleted) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    const isOwner =
      req.user && listing.createdBy?._id.toString() === req.user._id.toString();

    const responseListing = listing.toObject();

    if (!isOwner) {
      delete responseListing.privateDetails;
    }

    return res.status(200).json({ listing: responseListing });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    logError("Unable to retrieve listing", error);

    return res.status(500).json({
      message: "Unable to retrieve this listing.",
    });
  }
};

// FR-LIST-03: only the owner may edit their own Active listing.
const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id).select("+privateDetails");

    if (!listing || listing.isDeleted) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "You can only edit your own listings.",
      });
    }

    if (listing.status !== "active") {
      return res.status(409).json({
        message: "Only an active listing can be edited.",
      });
    }

    const allowedFields = [
      "title",
      "category",
      "brand",
      "color",
      "description",
      "date",
      "privateDetails",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    if (req.body.building !== undefined || req.body.zone !== undefined) {
      listing.location = {
        building: req.body.building ?? listing.location?.building,
        zone: req.body.zone ?? listing.location?.zone,
      };
    }

    const newImages = filesToImageUrls(req);
    if (newImages.length > 0) {
      listing.images = newImages;
    }

    await listing.save();

    await refreshMatchesForListing(listing).catch((error) => {
      logError("Unable to refresh matches after listing update", error);
    });

    return res.status(200).json({
      message: "Listing updated successfully.",
      listing,
    });
  } catch (error) {
    logError("Unable to update listing", error);

    return res.status(400).json({
      message: validationMessage(error),
    });
  }
};

// FR-LIST-03: soft delete, preserving the record rather than removing it.
const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing || listing.isDeleted) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    if (listing.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "You can only delete your own listings.",
      });
    }

    if (listing.status !== "active") {
      return res.status(409).json({
        message: "Only an active listing can be deleted.",
      });
    }

    listing.isDeleted = true;
    await listing.save();

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
