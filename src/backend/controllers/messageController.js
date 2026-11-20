const {
  flagMessage,
  getThreadMessages,
  listThreads,
  postMessage,
  MessagingError,
} = require("../services/messagingService");

function handleError(res, error, context) {
  if (error instanceof MessagingError) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error.name === "CastError") {
    return res.status(400).json({ message: "Invalid id." });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({ message: "Please check the message." });
  }

  console.error(`${context}: ${error.message}`);
  return res.status(500).json({ message: "Unable to complete the request." });
}

async function getMessages(req, res) {
  try {
    const result = await getThreadMessages(req.params.id, req.user, req.query.page);
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error, "Unable to retrieve messages");
  }
}

async function sendMessage(req, res) {
  try {
    const result = await postMessage(req.params.id, req.user, req.body.body);
    return res.status(201).json({
      message: "Message sent.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error, "Unable to send message");
  }
}

async function getThreads(req, res) {
  try {
    const threads = await listThreads(req.user);
    return res.status(200).json({ threads });
  } catch (error) {
    return handleError(res, error, "Unable to list message threads");
  }
}

async function flag(req, res) {
  try {
    const message = await flagMessage(req.params.id, req.user, req.body.reason);
    return res.status(200).json({ message: "Message flagged for review.", flagged: message });
  } catch (error) {
    return handleError(res, error, "Unable to flag message");
  }
}

module.exports = {
  flag,
  getMessages,
  getThreads,
  sendMessage,
};
