const mockUploadData = jest.fn();
const mockDownloadToBuffer = jest.fn();
const mockGetProperties = jest.fn();
const mockDeleteIfExists = jest.fn();
const mockGetContainerClient = jest.fn();
const mockServiceCtor = jest.fn();

jest.mock("@azure/storage-blob", () => ({
  BlobServiceClient: function (url, credential) {
    mockServiceCtor(url, credential);
    return {
      getContainerClient: (name) => {
        mockGetContainerClient(name);
        return {
          getBlockBlobClient: () => ({
            uploadData: mockUploadData,
            downloadToBuffer: mockDownloadToBuffer,
            getProperties: mockGetProperties,
            deleteIfExists: mockDeleteIfExists,
          }),
        };
      },
    };
  },
}));

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: function () {
    this.isDefault = true;
  },
}));

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAzureDriver, createLocalDriver } = require("../services/storage");

describe("Azure blob driver (mocked SDK)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("connects to the account endpoint with DefaultAzureCredential", async () => {
    const driver = createAzureDriver("myaccount");
    await driver.put("listings", "a.png", Buffer.from("x"), "image/png");

    expect(mockServiceCtor).toHaveBeenCalledWith(
      "https://myaccount.blob.core.windows.net",
      expect.objectContaining({ isDefault: true })
    );
    expect(mockGetContainerClient).toHaveBeenCalledWith("listing-photos");
    expect(mockUploadData).toHaveBeenCalledWith(Buffer.from("x"), {
      blobHTTPHeaders: { blobContentType: "image/png" },
    });
  });

  test("uses the evidence container and returns null for a missing blob", async () => {
    const driver = createAzureDriver("myaccount");
    mockDownloadToBuffer.mockRejectedValueOnce(Object.assign(new Error("nf"), { statusCode: 404 }));

    expect(await driver.get("evidence", "abc")).toBeNull();
    expect(mockGetContainerClient).toHaveBeenCalledWith("claim-evidence");
  });

  test("get returns the buffer and content type; remove deletes", async () => {
    const driver = createAzureDriver("myaccount");
    mockDownloadToBuffer.mockResolvedValueOnce(Buffer.from("data"));
    mockGetProperties.mockResolvedValueOnce({ contentType: "image/webp" });

    expect(await driver.get("listings", "a.webp")).toEqual({
      buffer: Buffer.from("data"),
      contentType: "image/webp",
    });

    await driver.remove("listings", "a.webp");
    expect(mockDeleteIfExists).toHaveBeenCalled();
  });
});

describe("Local driver", () => {
  test("round trips and rejects unsafe names", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lf-storage-"));
    const driver = createLocalDriver(root);

    await driver.put("listings", "a.png", Buffer.from("hi"), "image/png");
    expect(await driver.get("listings", "a.png")).toEqual({
      buffer: Buffer.from("hi"),
      contentType: "image/png",
    });

    await driver.remove("listings", "a.png");
    expect(await driver.get("listings", "a.png")).toBeNull();
    await expect(driver.get("listings", "../x")).rejects.toThrow("Invalid storage name.");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
