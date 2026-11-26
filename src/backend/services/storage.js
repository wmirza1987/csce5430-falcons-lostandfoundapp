// Blob storage driver. In Azure (STORAGE_ACCOUNT_NAME set) blobs live in private
// containers and are accessed with DefaultAzureCredential (managed identity in
// App Service, az login locally); shared-key access is disabled on the account.
// Without STORAGE_ACCOUNT_NAME (tests, local dev) files are written under
// .local-storage/<container>/. The driver is chosen once, on first use.
const fs = require("fs");
const path = require("path");

const LOCAL_ROOT = path.join(__dirname, "..", ".local-storage");

function containerName(containerKey) {
  const names = {
    listings: process.env.STORAGE_CONTAINER_LISTINGS || "listing-photos",
    evidence: process.env.STORAGE_CONTAINER_EVIDENCE || "claim-evidence",
  };

  if (!names[containerKey]) {
    throw new Error(`Unknown storage container key: ${containerKey}`);
  }

  return names[containerKey];
}

// Blob names are always server generated, but guard against path tricks anyway.
function assertSafeName(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith(".")) {
    throw new Error("Invalid storage name.");
  }
}

function createLocalDriver(root = LOCAL_ROOT) {
  function filePath(containerKey, name) {
    assertSafeName(name);
    return path.join(root, containerName(containerKey), name);
  }

  return {
    kind: "local",
    async put(containerKey, name, buffer, contentType) {
      const target = filePath(containerKey, name);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, buffer);
      await fs.promises.writeFile(`${target}.type`, contentType || "application/octet-stream");
    },
    async get(containerKey, name) {
      const target = filePath(containerKey, name);

      try {
        const buffer = await fs.promises.readFile(target);
        const contentType = await fs.promises
          .readFile(`${target}.type`, "utf8")
          .catch(() => "application/octet-stream");
        return { buffer, contentType };
      } catch (error) {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    async remove(containerKey, name) {
      const target = filePath(containerKey, name);

      for (const file of [target, `${target}.type`]) {
        await fs.promises.unlink(file).catch((error) => {
          if (error.code !== "ENOENT") {
            throw error;
          }
        });
      }
    },
  };
}

function createAzureDriver(accountName) {
  const { BlobServiceClient } = require("@azure/storage-blob");
  const { DefaultAzureCredential } = require("@azure/identity");
  const service = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );

  function blobClient(containerKey, name) {
    assertSafeName(name);
    return service.getContainerClient(containerName(containerKey)).getBlockBlobClient(name);
  }

  return {
    kind: "azure",
    async put(containerKey, name, buffer, contentType) {
      await blobClient(containerKey, name).uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream" },
      });
    },
    async get(containerKey, name) {
      const client = blobClient(containerKey, name);

      try {
        const buffer = await client.downloadToBuffer();
        const properties = await client.getProperties();
        return { buffer, contentType: properties.contentType || "application/octet-stream" };
      } catch (error) {
        if (error.statusCode === 404) {
          return null;
        }
        throw error;
      }
    },
    async remove(containerKey, name) {
      await blobClient(containerKey, name).deleteIfExists();
    },
  };
}

let driver = null;

function getDriver() {
  if (!driver) {
    driver = process.env.STORAGE_ACCOUNT_NAME
      ? createAzureDriver(process.env.STORAGE_ACCOUNT_NAME)
      : createLocalDriver();
  }

  return driver;
}

// For tests only: forget the selected driver so the next call re-reads the env.
function resetDriver() {
  driver = null;
}

module.exports = {
  createAzureDriver,
  createLocalDriver,
  get: (containerKey, name) => getDriver().get(containerKey, name),
  put: (containerKey, name, buffer, contentType) =>
    getDriver().put(containerKey, name, buffer, contentType),
  remove: (containerKey, name) => getDriver().remove(containerKey, name),
  resetDriver,
};
