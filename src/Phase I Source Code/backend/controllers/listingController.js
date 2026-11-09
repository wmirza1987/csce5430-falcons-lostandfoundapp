const Listing = require("../models/Listing");
const { filesToImageUrls } = require("../middleware/uploadMiddleware");

// FR LIST 01, FR LIST 02, FR AUTH 01: create a Lost or Found listing.
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
      description,
      date,
      location: { building, zone },
      images,
      privateDetails,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      message: "Listing created successfully.",
      listing,
    });
  } catch (error) {
    return res.status(400).json({
      message: "Unable to create listing.",
      error: error.message,
    });
  }
};

// FR SRCH 01, FR SRCH 02: public browse, search, and filter, paginated at 20 per page.
const getListings = async (req, res) => {
  try {
    const {
      search,
      type,
      category,
      building,
      zone,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {
      isDeleted: false,
      status: "active",
    };

    if (type) {
      query.type = type;
    }

    if (category) {
      query.category = category;
    }

    if (building) {
      query["location.building"] = building;
    }

    if (zone) {
      query["location.zone"] = zone;
    }

    if (startDate || endDate) {
      query.date = {};

      if (startDate) {
        query.date.$gte = new Date(startDate);
      }

      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 20);

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
    return res.status(500).json({
      message: "Unable to retrieve listings.",
      error: error.message,
    });
  }
};

// Fetches one listing by id directly, instead of requiring the caller to
// page through the full list. Private details are included only for the
// listing's own owner, consistent with FR LIST 04 and NFR PRIV 01.
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
      req.user && listing.createdBy._id.toString() === req.user._id.toString();

    const responseListing = listing.toObject();

    if (!isOwner) {
      delete responseListing.privateDetails;
    }

    return res.status(200).json({ listing: responseListing });
  } catch (error) {
    return res.status(400).json({
      message: "Unable to retrieve this listing.",
      error: error.message,
    });
  }
};

// FR LIST 03: only the owner may edit their own Active listing.
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

    const allowedFields = [
      "title",
      "category",
      "description",
      "date",
      "privateDetails",
      "status",
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

    return res.status(200).json({
      message: "Listing updated successfully.",
      listing,
    });
  } catch (error) {
    return res.status(400).json({
      message: "Unable to update listing.",
      error: error.message,
    });
  }
};

// FR LIST 03: soft delete, preserving the record rather than removing it.
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

    listing.isDeleted = true;
    await listing.save();

    return res.status(200).json({
      message: "Listing deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete listing.",
      error: error.message,
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
