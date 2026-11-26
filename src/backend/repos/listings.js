const { query } = require("../db/pool");
const {
  chunk,
  escapeLike,
  idOf,
  inList,
  lowerId,
  optionalId,
  parseJson,
  runner,
} = require("./util");

const MAX_IMAGES = 3;

const PUBLIC_COLUMNS = [
  "id",
  "type",
  "title",
  "category",
  "brand",
  "color",
  "description",
  "date",
  "building",
  "zone",
  "imagesJson",
  "status",
  "createdBy",
  "isDeleted",
  "isHidden",
  "createdAt",
  "updatedAt",
];

// Private columns are only selected when the caller asks for them explicitly.
const PRIVATE_DETAILS_COLUMNS = ["privateDetails"];
const MODERATION_COLUMNS = ["hiddenReason", "hiddenBy", "hiddenAt"];

function columnsFor({ includePrivate = false, includeModeration = false } = {}) {
  return [
    ...PUBLIC_COLUMNS,
    ...(includePrivate ? PRIVATE_DETAILS_COLUMNS : []),
    ...(includeModeration ? MODERATION_COLUMNS : []),
  ];
}

function selectList(options, alias = "l") {
  return columnsFor(options)
    .map((column) => `${alias}.${column}`)
    .join(", ");
}

function outputList(options) {
  return columnsFor(options)
    .map((column) => `inserted.${column}`)
    .join(", ");
}

function mapListing(row, options = {}) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);
  const listing = {
    _id: id,
    id,
    type: row.type,
    title: row.title,
    category: row.category,
    brand: row.brand,
    color: row.color,
    description: row.description,
    date: row.date,
    location:
      row.zone === null || row.zone === undefined
        ? { building: row.building }
        : { building: row.building, zone: row.zone },
    images: parseJson(row.imagesJson, []).map(imageUrl),
    status: row.status,
    createdBy: lowerId(row.createdBy),
    isDeleted: Boolean(row.isDeleted),
    isHidden: Boolean(row.isHidden),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (options.includePrivate) {
    listing.privateDetails = row.privateDetails ?? undefined;
  }

  if (options.includeModeration) {
    listing.hiddenReason = row.hiddenReason;
    listing.hiddenBy = lowerId(row.hiddenBy);
    listing.hiddenAt = row.hiddenAt;
  }

  if (row.creatorFirstName !== undefined) {
    listing.createdBy = {
      _id: lowerId(row.createdBy),
      firstName: row.creatorFirstName,
      lastName: row.creatorLastName,
    };
  }

  return listing;
}

// imagesJson stores blob names; API responses expose them as URLs.
const IMAGE_URL_PREFIX = "/api/v1/images/";

function imageUrl(name) {
  return typeof name === "string" && !name.startsWith("/") ? `${IMAGE_URL_PREFIX}${name}` : name;
}

function imageName(value) {
  return value.startsWith(IMAGE_URL_PREFIX) ? value.slice(IMAGE_URL_PREFIX.length) : value;
}

function cleanImages(images) {
  return (Array.isArray(images) ? images : [])
    .filter((image) => typeof image === "string")
    .map(imageName)
    .slice(0, MAX_IMAGES);
}

function text(value) {
  return value === undefined || value === null ? null : String(value).trim();
}

async function create(input, tx, options = {}) {
  const rows = await runner(tx)(
    `INSERT INTO dbo.Listings
       (type, title, category, brand, color, description, date, building, zone,
        imagesJson, status, privateDetails, createdBy, isDeleted)
     OUTPUT ${outputList(options)}
     VALUES (@type, @title, @category, @brand, @color, @description, @date, @building, @zone,
        @imagesJson, @status, @privateDetails, @createdBy, @isDeleted)`,
    {
      type: input.type,
      title: text(input.title),
      category: text(input.category),
      brand: text(input.brand) ?? "",
      color: text(input.color) ?? "",
      description: text(input.description),
      date: input.date,
      building: text(input.location?.building),
      zone: text(input.location?.zone),
      imagesJson: JSON.stringify(cleanImages(input.images)),
      status: input.status || "active",
      privateDetails: text(input.privateDetails),
      createdBy: idOf(input.createdBy),
      isDeleted: Boolean(input.isDeleted),
    }
  );

  return mapListing(rows[0], options);
}

async function findById(id, options = {}, tx) {
  const creatorJoin = options.populateCreator
    ? "JOIN dbo.Users c ON c.id = l.createdBy"
    : "";
  const creatorColumns = options.populateCreator
    ? ", c.firstName AS creatorFirstName, c.lastName AS creatorLastName"
    : "";
  const rows = await runner(tx)(
    `SELECT ${selectList(options)}${creatorColumns} FROM dbo.Listings l ${creatorJoin} WHERE l.id = @id`,
    { id: idOf(id) }
  );
  return mapListing(rows[0], options);
}

async function findByIds(ids, options = {}) {
  const unique = [...new Set(ids.map((id) => idOf(id)))];
  const found = [];

  for (const part of chunk(unique)) {
    if (part.length === 0) {
      continue;
    }

    const { sql: placeholders, params } = inList("id", part);
    const rows = await query(
      `SELECT ${selectList(options)} FROM dbo.Listings l WHERE l.id IN (${placeholders})`,
      params
    );
    found.push(...rows.map((row) => mapListing(row, options)));
  }

  return found;
}

// Fields an edit may change. Each maps to a fixed column name.
const UPDATABLE = {
  title: "title",
  category: "category",
  brand: "brand",
  color: "color",
  description: "description",
  date: "date",
  building: "building",
  zone: "zone",
  privateDetails: "privateDetails",
};

// Updates the allow-listed fields present in `changes` (building and zone may
// also arrive nested as changes.location) and returns the updated listing.
async function update(id, changes, options = {}) {
  const flat = { ...changes };

  if (changes.location) {
    flat.building = changes.location.building;
    flat.zone = changes.location.zone;
  }

  const assignments = [];
  const params = { id: idOf(id) };

  for (const [field, column] of Object.entries(UPDATABLE)) {
    if (flat[field] !== undefined) {
      assignments.push(`${column} = @${field}`);
      params[field] = field === "date" ? flat.date : text(flat[field]);
    }
  }

  if (changes.images !== undefined) {
    assignments.push("imagesJson = @imagesJson");
    params.imagesJson = JSON.stringify(cleanImages(changes.images));
  }

  if (assignments.length === 0) {
    return findById(id, options);
  }

  const rows = await query(
    `UPDATE dbo.Listings SET ${assignments.join(", ")}, updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList(options)} WHERE id = @id`,
    params
  );

  return mapListing(rows[0], options);
}

// Soft delete. Returns true only if an undeleted listing was changed.
async function softDelete(id) {
  const rows = await query(
    `UPDATE dbo.Listings SET isDeleted = 1, updatedAt = SYSUTCDATETIME()
     OUTPUT inserted.id WHERE id = @id AND isDeleted = 0`,
    { id: idOf(id) }
  );
  return rows.length > 0;
}

// Conditional resolve used by claim approval. Succeeds only if the listing is
// active and not deleted, so two concurrent approvals cannot both win.
async function markResolvedIfActive(id, tx) {
  const rows = await runner(tx)(
    `UPDATE dbo.Listings SET status = 'resolved', updatedAt = SYSUTCDATETIME()
     OUTPUT ${outputList({})}
     WHERE id = @id AND status = 'active' AND isDeleted = 0`,
    { id: idOf(id) }
  );
  return mapListing(rows[0]);
}

async function setHidden(id, { hidden, reason = "", hiddenBy = null }, tx) {
  const rows = await runner(tx)(
    `UPDATE dbo.Listings SET isHidden = @hidden, hiddenReason = @reason, hiddenBy = @hiddenBy,
       hiddenAt = @hiddenAt, updatedAt = SYSUTCDATETIME()
     OUTPUT inserted.id WHERE id = @id`,
    {
      id: idOf(id),
      hidden: Boolean(hidden),
      reason: hidden ? String(reason) : "",
      hiddenBy: hidden ? optionalId(hiddenBy) : null,
      hiddenAt: hidden ? new Date() : null,
    }
  );
  return rows.length > 0;
}

async function listIdsByOwner(userId) {
  const rows = await query(
    "SELECT id FROM dbo.Listings WHERE createdBy = @userId AND isDeleted = 0",
    { userId: idOf(userId) }
  );
  return rows.map((row) => lowerId(row.id));
}

// Opposite-type, active, undeleted listings that a listing may match.
async function findMatchCandidates(excludeId, type) {
  const rows = await query(
    `SELECT ${selectList({})} FROM dbo.Listings l
     WHERE l.id <> @excludeId AND l.type = @type AND l.status = 'active' AND l.isDeleted = 0`,
    { excludeId: idOf(excludeId), type }
  );
  return rows.map((row) => mapListing(row));
}

// Shared WHERE-clause builder for the public filters. Every fragment is a fixed
// string; every request value is bound as a parameter. LIKE patterns have their
// wildcards escaped and use ESCAPE '\'.
function buildPublicFilter(filters = {}, { status = "active" } = {}) {
  const clauses = ["l.isDeleted = 0", "l.isHidden = 0"];
  const params = {};

  if (status) {
    clauses.push("l.status = @status");
    params.status = status;
  }

  if (filters.type) {
    clauses.push("l.type = @type");
    params.type = filters.type;
  }

  // Equality uses the database's case-insensitive collation.
  const equalities = [
    ["category", "l.category"],
    ["brand", "l.brand"],
    ["color", "l.color"],
    ["building", "l.building"],
    ["zone", "l.zone"],
  ];

  for (const [key, column] of equalities) {
    if (filters[key]) {
      clauses.push(`${column} = @${key}`);
      params[key] = filters[key];
    }
  }

  if (filters.startDate) {
    clauses.push("l.date >= @startDate");
    params.startDate = filters.startDate;
  }

  if (filters.endDate) {
    clauses.push("l.date <= @endDate");
    params.endDate = filters.endDate;
  }

  if (filters.search) {
    clauses.push(
      "(l.title LIKE @term ESCAPE '\\' OR l.description LIKE @term ESCAPE '\\'" +
        " OR l.category LIKE @term ESCAPE '\\' OR l.brand LIKE @term ESCAPE '\\'" +
        " OR l.color LIKE @term ESCAPE '\\')"
    );
    params.term = `%${escapeLike(filters.search)}%`;
  }

  return { where: clauses.join(" AND "), params };
}

// Public browse: filtered, newest first, with the creator's name populated.
async function search(filters, { page, pageSize }) {
  const { where, params } = buildPublicFilter(filters);
  const counted = await query(`SELECT COUNT(*) AS total FROM dbo.Listings l WHERE ${where}`, params);
  const rows = await query(
    `SELECT ${selectList({})}, c.firstName AS creatorFirstName, c.lastName AS creatorLastName
     FROM dbo.Listings l JOIN dbo.Users c ON c.id = l.createdBy
     WHERE ${where}
     ORDER BY l.createdAt DESC, l.id
     OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
    { ...params, skip: (page - 1) * pageSize, take: pageSize }
  );

  return { total: counted[0].total, listings: rows.map((row) => mapListing(row)) };
}

// Public map pins: title, type, category and location only. `filters.status`
// may be "active", "resolved", or empty for both.
async function listForMap(filters, { limit = 200 } = {}) {
  const { where, params } = buildPublicFilter(filters, { status: filters.status || null });
  const rows = await query(
    `SELECT TOP (@limit) l.id, l.title, l.type, l.category, l.building, l.zone
     FROM dbo.Listings l WHERE ${where} ORDER BY l.createdAt DESC`,
    { ...params, limit }
  );

  return rows.map((row) => ({
    _id: lowerId(row.id),
    id: lowerId(row.id),
    title: row.title,
    type: row.type,
    category: row.category,
    location:
      row.zone === null || row.zone === undefined
        ? { building: row.building }
        : { building: row.building, zone: row.zone },
  }));
}

// Aggregates for the admin dashboard (FR-ADM-03). Only counts and non-private
// grouping columns are read. Grouping is case sensitive, like the JS version.
async function analytics() {
  const visible = "isDeleted = 0 AND isHidden = 0";
  const totals = await query(
    `SELECT status, type, COUNT(*) AS n,
       SUM(CASE WHEN status = 'resolved' AND updatedAt > createdAt
                THEN CAST(DATEDIFF_BIG(millisecond, createdAt, updatedAt) AS FLOAT) ELSE 0 END) AS resolutionMs
     FROM dbo.Listings WHERE ${visible} GROUP BY status, type`
  );
  const categories = await query(
    `SELECT category COLLATE Latin1_General_100_BIN2 AS name, COUNT(*) AS n
     FROM dbo.Listings WHERE ${visible} AND category <> ''
     GROUP BY category COLLATE Latin1_General_100_BIN2`
  );
  const buildings = await query(
    `SELECT building COLLATE Latin1_General_100_BIN2 AS name, MIN(zone) AS zone, COUNT(*) AS n
     FROM dbo.Listings WHERE ${visible} AND building <> ''
     GROUP BY building COLLATE Latin1_General_100_BIN2`
  );

  return {
    totals: totals.map((row) => ({
      status: row.status,
      type: row.type,
      count: row.n,
      resolutionMs: row.resolutionMs || 0,
    })),
    categories: categories.map((row) => ({ name: row.name, count: row.n })),
    buildings: buildings.map((row) => ({ name: row.name, zone: row.zone || "", count: row.n })),
  };
}

module.exports = {
  MAX_IMAGES,
  analytics,
  create,
  findById,
  findByIds,
  findMatchCandidates,
  listForMap,
  listIdsByOwner,
  markResolvedIfActive,
  search,
  setHidden,
  softDelete,
  update,
};
