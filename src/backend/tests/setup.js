require("dotenv").config();

const mongoose = require("mongoose");

jest.setTimeout(30000);

function getTestDatabaseUri() {
  if (process.env.MONGODB_URI_TEST) {
    return process.env.MONGODB_URI_TEST;
  }

  const baseUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lost_and_found";
  const [withoutQuery, query] = baseUri.split("?");
  const trimmed = withoutQuery.replace(/\/$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  const prefix = lastSlash >= 0 ? trimmed.slice(0, lastSlash) : trimmed;
  const databaseName = "lost_and_found_test";

  return `${prefix}/${databaseName}${query ? `?${query}` : ""}`;
}

beforeAll(async () => {
  await mongoose.connect(getTestDatabaseUri());
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();

  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
