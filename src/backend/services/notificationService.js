function createNotification(type, message, userId, relatedListingId = null) {
  return {
    type,
    message,
    userId,
    relatedListingId,
    isRead: false,
    createdAt: new Date(),
  };
}

function createMatchNotification(userId, listingId) {
  return createNotification(
    "match",
    "A possible match was found for your listing.",
    userId,
    listingId
  );
}

module.exports = {
  createNotification,
  createMatchNotification,
}; 