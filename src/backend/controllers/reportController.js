const {
  createReport,
  decideReport,
  getReport,
  listReports,
  ReportError,
} = require("../services/reportService");

function handleError(res, error, context) {
  if (error instanceof ReportError) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error.name === "CastError") {
    return res.status(400).json({ message: "Invalid id." });
  }

  console.error(`${context}: ${error.message}`);
  return res.status(500).json({ message: "Unable to complete the request." });
}

async function create(req, res) {
  try {
    const report = await createReport({
      user: req.user,
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      reason: req.body.reason,
    });

    return res.status(201).json({ message: "Report submitted for review.", report });
  } catch (error) {
    return handleError(res, error, "Unable to submit report");
  }
}

async function index(req, res) {
  try {
    const reports = await listReports({ status: req.query.status });
    return res.status(200).json({ reports });
  } catch (error) {
    return handleError(res, error, "Unable to list reports");
  }
}

async function show(req, res) {
  try {
    const report = await getReport(req.params.id);
    return res.status(200).json({ report });
  } catch (error) {
    return handleError(res, error, "Unable to retrieve report");
  }
}

async function decide(req, res) {
  try {
    const report = await decideReport({
      reportId: req.params.id,
      moderator: req.user,
      decision: req.body.decision,
      decisionNote: req.body.decisionNote,
    });

    return res.status(200).json({ message: "Report decision recorded.", report });
  } catch (error) {
    return handleError(res, error, "Unable to record report decision");
  }
}

module.exports = { create, decide, index, show };
