const { google } = require("googleapis");
const { state } = require("./state");
const fs = require("fs");
const path = require("path");
const { getFolderID, getFileID } = require("./read.drive");
const { default: axios } = require("axios");

/**
 * Upload a file to Google Drive.
 *
 * @param {Object} options - The options for the upload.
 * @param {string} options.fileName - The name of the file to be uploaded.
 * @param {string} options.folderName - The name of the folder where the file will be uploaded.
 * @param {string} options.folderId - The ID of the folder where the file will be uploaded.
 * @param {string} options.filePath - The path of the file to be uploaded.
 * @param {boolean} options.forceAvailable - If true, will overwrite the file if it already exists.
 * @param {boolean} options.progress - If true, will display upload progress.
 * @returns {Promise<Object>} A promise that resolves to an object with the keys "id" if the upload was successful.
 */
const uploadFile = async ({
  fileName,
  folderName,
  folderId,
  filePath,
  forceAvailable = false, // add new with a new name
  progress = false,
}) => {
  if (!forceAvailable) {
    const isAvailable = await getFileID(fileName);
    if (isAvailable.data.files.length > 0)
      return {
        ...isAvailable,
        data: {
          id: isAvailable.data.files[0]?.id,
        },
      };
  }

  folderId = folderId || (await getFolderID(folderName)).data.files[0].id;
  const fileMetadata = {
    name: fileName || path.basename(filePath),
    parents: [folderId],
  };

  const drive = google.drive({ version: "v3", auth: state.auth });

  const fileSize = fs.statSync(filePath).size;
  let uploadedBytes = 0;
  let startTime = Date.now();

  return drive.files.create(
    {
      requestBody: fileMetadata,
      media: {
        body: fs.createReadStream(filePath),
        mimeType: "application/octet-stream",
      },
      fields: "id",
    },
    {
      onUploadProgress: progress
        ? (_progress) => {
            uploadedBytes = _progress.bytesRead;
            const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
            const progressStatus = ((uploadedBytes / fileSize) * 100).toFixed(
              2
            );
            const speed = (uploadedBytes / elapsedTime / 1024).toFixed(2); // KB/s

            process.stdout.write(
              `\rUploading: ${progressStatus}% | Speed: ${speed} KB/s`
            );
          }
        : undefined,
    }
  );
};

const uploadStream = async ({
  fileName,
  folderName,
  folderId,
  stream,
  progress = false,
}) => {
  folderId = folderId || (await getFolderID(folderName)).data.files[0].id;
  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const drive = google.drive({ version: "v3", auth: state.auth });

  return drive.files.create(
    {
      requestBody: fileMetadata,
      media: {
        body: stream,
        mimeType: "application/octet-stream",
      },
      fields: "id",
    },
    {
      onUploadProgress: progress
        ? (_progress) => {
            const progressStatus = (
              (_progress.bytesRead / _progress.totalBytes) *
              100
            ).toFixed(2);
            process.stdout.write(`\rUploading: ${progressStatus}%`);
          }
        : undefined,
    }
  );
};

const createFolder = async (folderName, parentID) => {
  const drive = google.drive({ version: "v3", auth: state.auth });

  const folderMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentID ? [parentID] : [],
  };

  return drive.files.create({
    requestBody: folderMetadata,
    fields: "id",
  });
};

const uploadImageFromUrl = async ({
  url,
  fileName,
  folderName,
  folderId,
  progress = false,
}) => {
  folderId = folderId || (await getFolderID(folderName)).data.files?.[0]?.id;
  fileName = fileName || url.split("/").slice(-1)[0];

  const imageMimeType = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/webp",
  ];

  try {
    const res = await axios.get(url, { responseType: "stream" });
    if (
      !imageMimeType.includes(res.headers["content-type"]) ||
      !res.headers["content-type"]
    )
      return;

    return uploadStream({
      fileName,
      folderId,
      stream: res.data,
      progress,
    });
  } catch (error) {
    throw error;
  }
};

module.exports = { uploadFile, uploadStream, createFolder, uploadImageFromUrl };
