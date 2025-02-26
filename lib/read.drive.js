const { google } = require("googleapis");
const { state } = require("./state");
const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");
const { formatSizeToKB } = require("./library");

state.temp = [];
state.waitingRoom = [];
state.setTemp = function (data) {
  state.temp = data;
};
state.addTemp = function (data) {
  state.temp = [...state.temp, ...data];
};
state.setWaitingRoom = function (data) {
  state.waitingRoom = data;
};
state.addWaitingRoom = function (data) {
  state.waitingRoom = [...state.waitingRoom, ...data];
};

/**
 * Retrieves the ID of a specified folder from Google Drive. If the folder does not exist and the
 * `createNew` option is set to true, a new folder will be created.
 *
 * @param {string} folderName - The name of the folder for which to retrieve the ID.
 * @param {Object} _options - Additional options for folder retrieval.
 * @param {string} [_options.parent="root"] - The parent directory ID or path. on depth is true: /parent/child/grandchild ...
 * @param {boolean} [_options.depth=false] - If true, will search recursively for the folder.
 * @param {boolean} [_options.createNew=false] - If true, a new folder will be created if it does not exist.
 * @returns {Promise<Object>} - A promise that resolves to the folder information response from the Google Drive API.
 */
const getFolderID = async (folderName, _options) => {
  const option = {
    depth: false,
    createNew: false,
    ..._options,
  };
  const config = {
    currentFolderId: option?.parent,
    param: "parentChild",
  };

  if (!option?.parent) config.param = "single";

  if (option.depth) {
    // example parent if depth is true: /parent/child/grandchild ...
    const tree = option.parent.split("/").filter((item) => item);
    config.currentFolderId = "root";

    for (let _dir of tree) {
      const result = await getFolderID(_dir, {
        createNew: true,
        depth: false,
        parent: config.currentFolderId,
      });

      config.currentFolderId = result.data.files?.[0]?.id;
    }
  }

  const params = {
    parentChild: {
      q: `'${config.currentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`,
      fields: "files(id, name)",
    },
    single: {
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
      fields:
        "files(id, name, parents, mimeType, size, modifiedTime, createdTime, webViewLink, thumbnailLink, webContentLink, fullFileExtension, fileExtension)",
    },
  };

  try {
    const drive = google.drive({ version: "v3", auth: state.auth });
    const response = await drive.files.list(params[config.param]);

    // if data not found and createNew is true
    if (response.data.files.length === 0 && option.createNew) {
      const { createFolder } = require("./write.drive");
      const res = await createFolder(folderName, config.currentFolderId);
      return { ...res, data: { files: [res.data] } };
    }

    return response;
  } catch (error) {
    // try if parent inpur is not id from google drive
    if (error?.response?.status === 404) {
      const folderId = await getFolderID(option.parent);
      return await getFolderID(folderName, {
        ...option,
        parent: folderId.data.files[0].id,
      });
    }

    throw error;
  }
};

// Get the file ID from the file name
const getFileID = async (fileName) => {
  const drive = google.drive({ version: "v3", auth: state.auth });
  return await drive.files.list({
    q: `mimeType!='application/vnd.google-apps.folder' and name='${fileName}'`,
    fields:
      "files(id, name, parents, mimeType, size, modifiedTime, createdTime, webViewLink, thumbnailLink, webContentLink, fullFileExtension, fileExtension)",
  });
};

const getFileByID = async (fileID) => {
  const drive = google.drive({ version: "v3", auth: state.auth });
  return await drive.files.get({
    fileId: fileID,
    fields: "*",
  });
};

// Get Multiple File ID from the file name
const getMultipleFileID = async (fileNames = []) => {
  const drive = google.drive({ version: "v3", auth: state.auth });
  return await drive.files.list({
    q: `mimeType!='application/vnd.google-apps.folder' and name in '${fileNames.join(
      "', '"
    )}'`,
    fields:
      "files(id, name, parents, mimeType, size, modifiedTime, createdTime, webViewLink, thumbnailLink, webContentLink, fullFileExtension, fileExtension)",
  });
};

const lsFolder = async (parent = "root", nextPageToken) => {
  const pageToken = nextPageToken || null;
  try {
    const drive = google.drive({ version: "v3", auth: state.auth });
    const res = await drive.files.list({
      q: `'${parent}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageToken: pageToken,
    });

    const nextPageToken = res.data.nextPageToken;
    const data = [...state.temp, ...res.data.files];

    state.dispatch("setTemp", [data]);

    if (nextPageToken) {
      return lsFolder(parent, nextPageToken);
    } else {
      console.log({ info: "Get all on folder done", dataLength: data.length });
      state.dispatch("setTemp", [[]]);
      return data;
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      const folderId = await getFolderID(parent);
      return await lsFolder(folderId.data.files[0].id);
    }
    throw error;
  }
};

// Get list off all files and folders in the folder
const lsFolderFromFolder = async (parent = "root", nextPageToken) => {
  const pageToken = nextPageToken || null;
  try {
    const drive = google.drive({ version: "v3", auth: state.auth });
    const res = await drive.files.list({
      q: `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken ,files(id, name)",
      pageSize: 100,
      pageToken,
    });

    const nextPageToken = res.data.nextPageToken;
    const data = [...state.temp, ...res.data.files];

    state.dispatch("setTemp", [data]);

    if (nextPageToken) {
      return lsFolderFromFolder(parent, nextPageToken);
    } else {
      console.log({ info: "Get all folder done", dataLength: data.length });
      state.dispatch("setTemp", [[]]);
      return data;
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      let folderId = await getFolderID(parent);
      folderId = folderId.data.files[0].id;
    }
  }
};

const lsFileFromFolder = async (parent = "root", nextPageToken) => {
  const pageToken = nextPageToken || null;
  try {
    const drive = google.drive({ version: "v3", auth: state.auth });
    const res = await drive.files.list({
      q: `'${parent}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken, files(id, name, mimeType, fileExtension)",
      pageSize: 100,
      pageToken,
    });

    const nextPageToken = res.data.nextPageToken;
    const data = [...state.temp, ...res.data.files];

    state.dispatch("setTemp", [data]);

    if (nextPageToken) {
      return lsFileFromFolder(parent, nextPageToken);
    } else {
      console.log({ info: "Get all file done", dataLength: data.length });
      state.dispatch("setTemp", [[]]);
      return data;
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      let folderId = await getFolderID(parent);
      folderId = folderId.data.files[0].id;

      return await lsFileFromFolder(folderId);
    }

    throw error;
  }
};

/**
 * Downloads a file from Google Drive using the provided file ID.
 *
 * @param {Object} options - The options for the download.
 * @param {string} options._fileName - The name of the file to be downloaded.
 * @param {string} options.fileId - The ID of the file to be downloaded.
 * @param {string} options.folderPath - The folder path where the file will be downloaded.
 * @param {Object} [options.option={ progress: false, onSame: "skip" }] - The options for the download. If progress is true, will display download progress. If onSame is ["skip", "overwrite", "rename"], will overwrite file if exist.
 * @returns {Promise<Object>} A promise that resolves to an object with the keys "fileName" and "folderPath" if the download was successful.
 */
const downloadFile = async ({
  _fileName,
  fileId,
  folderPath,
  option = { progress: false, onSame: "overwrite" },
}) => {
  const drive = google.drive({ version: "v3", auth: state.auth });
  folderPath = path.join(state?.rootDir, "/downloadBox", folderPath);
  let fileName = path.join(folderPath, _fileName);

  if (fs.existsSync(fileName) && option.onSame === "skip")
    return { fileName, folderPath };

  if (fs.existsSync(fileName) && option.onSame === "rename") {
    let i = 1;
    const _file = {
      filename: fileName.split(".")[0],
      extension: fileName.split(".")[1],
    };
    while (fs.existsSync(_file.filename + ` (${i})` + "." + _file.extension))
      i++;
    fileName = _file.filename + ` (${i})` + "." + _file.extension;
  }

  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath); // if file path is not exist, create it
  const file = fs.createWriteStream(fileName);

  try {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    let _progress = 0;
    res.data.on("data", (chunk) => {
      if (!option.progress) return;

      option.progress += chunk.length;
      process.stdout.write(`\r${formatSizeToKB(_progress)} downloaded`);
    });

    res.data.on("end", () => {
      if (!option.progress) return;

      process.stdout.write("\n");
      console.log({ info: "done", size: formatSizeToKB(_progress) });
    });

    res.data.on("error", (err) => {
      throw err;
    });

    res.data.pipe(file);
    return { fileName, folderPath };
  } catch (error) {
    throw error;
  }
};

const getAllFileOnFolder = async (
  folderId = "root",
  { download = false, setFolderPath }
) => {
  try {
    const drive = google.drive({ version: "v3", auth: state.auth });

    let totalSize = 0;
    let pageToken = null;

    let idWorker = 0;
    const report = {
      callCount: 0,
      completedWorker: 0,
      errorWorker: 0,
    };

    state.subscribe("addTemp", (data) => {
      console.log({ cekaddtemp: data });
    });

    if (download) {
      state.subscribe("addWaitingRoom", async (data) => {
        idWorker++;
        report.callCount = report.callCount + 1;

        const _data = await Promise.all(
          data.map(async (item) => {
            let folderPath = "";
            if (typeof setFolderPath === "function" && setFolderPath) {
              folderPath = setFolderPath(item.name) || "";
            }

            return {
              _fileName: item.name,
              fileId: item.id,
              folderPath,
            };
          })
        );

        const worker = new Worker(
          path.join(state.rootDir, "worker/download.worker.js"),
          { workerData: { data: _data, id: idWorker } }
        );

        worker.on("message", (result) => {
          report.completedWorker = report.completedWorker + 1;
          console.log({ info: `Worker ${idWorker} Done` });
        });

        worker.on("error", (error) => {
          report.errorWorker = report.errorWorker + 1;
          console.log({ info: `Worker ${idWorker} error`, error });
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            console.log({
              info: `Worker ${idWorker} exited with code ${code}`,
            });
          }

          if (report.callCount === report.completedWorker + report.errorWorker)
            console.log({ info: `All worker completed`, report });
        });
      });
    }

    async function processFolder(currentFolderId) {
      do {
        const response = await drive.files.list({
          q: `'${currentFolderId}' in parents and trashed = false`,
          fields: "nextPageToken, files(id, name, mimeType, size)",
          pageToken: pageToken,
        });

        const files = response.data.files;

        if (files && files.length) {
          const dataFile = [];
          for (const file of files) {
            if (file.mimeType === "application/vnd.google-apps.folder") {
              // Recursive call for subfolders
              await processFolder(file.id);
            } else if (file.size) {
              dataFile.push(file);
              totalSize += parseInt(file.size);
            }
          }

          state.dispatch("addTemp", [dataFile]);
          if (download) state.dispatch("addWaitingRoom", [dataFile]);
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);
    }

    await processFolder(folderId);

    const result = {
      size: totalSize,
      files: state.temp,
      sizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    };

    state.dispatch("setTemp", [[]]);

    return result;
  } catch (error) {
    if (error?.response?.status === 404) {
      folderId = await getFolderID(folderId);
      folderId = folderId.data.files[0].id;

      return await getAllFileOnFolder(folderId);
    }

    console.error("Error getting folder size recursively:", error);
    return null;
  }
};

module.exports = {
  getFolderID,
  getFileID,
  lsFolderFromFolder,
  getMultipleFileID,
  lsFileFromFolder,
  downloadFile,
  lsFolder,
  getAllFileOnFolder,
  getFileByID,
};
