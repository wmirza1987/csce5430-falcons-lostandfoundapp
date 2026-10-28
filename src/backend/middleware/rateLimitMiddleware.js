// Small in-memory fixed-window limiter. It is intentionally dependency-free
// and sufficient for this single-instance course deployment; a production
// deployment should move the counters to Redis or a gateway.
function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 30,
  message = "Too many requests. Please try again later.",
} = {}) {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();

    for (const [key, record] of hits.entries()) {
      if (record.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, windowMs);

  if (typeof cleanup.unref === "function") {
    cleanup.unref();
  }

  return (req, res, next) => {
    const key = `${req.ip || req.socket?.remoteAddress || "unknown"}:${
      req.user?._id || "anonymous"
    }`;
    const now = Date.now();
    let record = hits.get(key);

    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs };
      hits.set(key, record);
    }

    record.count += 1;

    if (record.count > max) {
      res.set("Retry-After", String(Math.ceil((record.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }

    return next();
  };
}

module.exports = { rateLimit };
