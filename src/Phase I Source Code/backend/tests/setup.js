require("dotenv").config();

const mongoose = require("mongoose");

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
});

afterAll(async () => {
  await mongoose.connection.close();
});