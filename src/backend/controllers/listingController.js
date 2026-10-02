const Listing = require("../models/Listing");

const createListing = async (req, res) => {
  try {
    const {
      type,
      title,
      category,
      description,
      date,
      location,
      images,
      privateDetails,
    } = req.body;

    const listing = await Listing.create({
      type,
      title,
      category,
      description,
      date,
      location,
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

const getListings = async (req, res) => {
  try {
    const {
      search,
      type,
      category,
      building,
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

const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

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
      "location",
      "images",
      "privateDetails",
      "status",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

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
  updateListing,
  deleteListing,
};