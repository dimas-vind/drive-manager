const { google } = require("googleapis");
const { state } = require("./state");

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

// Get list off all files and folders in the folder
const lsFolderFromFolder = async (parent = "root") => {
  let folderId = parent;
  if (parent !== "root") {
    folderId = await getFolderID(parent);
    folderId = folderId.data.files[0].id;
  }

  const drive = google.drive({ version: "v3", auth: state.auth });
  return await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
    fields: "files(id, name)",
  });
};

const lsFileFromFolder = async (parent = "root") => {
  let folderId = parent;
  if (parent !== "root") {
    folderId = await getFolderID(parent);
    folderId = folderId.data.files[0].id;
  }

  const drive = google.drive({ version: "v3", auth: state.auth });
  return await drive.files.list({
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder'`,
    fields: "files(id, name, mimeType, fileExtension)",
  });
};

module.exports = {
  getFolderID,
  getFileID,
  lsFolderFromFolder,
  getMultipleFileID,
  lsFileFromFolder,
};
