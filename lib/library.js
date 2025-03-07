const fs = require("fs");
const path = require("path");
const { db } = require("./db_services/library");
const { glob } = require("glob");

const isEmptyObject = (obj) => {
  return !obj || Object.keys(obj).length === 0;
};

const parseInteger = (string) =>
  typeof string === "string" ? Number.parseInt(string) : string;

const isInteger = (num) =>
  typeof parseInteger(num) === "number" &&
  !isNaN(parseInteger(num)) &&
  Number.isInteger(parseInteger(num));

const isObject = (obj) => {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
};

const arrayOfObjectGet = (array, get = []) => {
  return array.map((item) =>
    get?.length > 1
      ? Object.entries(item).reduce(
          (current, [key, value]) =>
            get.includes(key) ? { ...current, [key]: value } : current,
          {}
        )
      : item?.[get?.[0]]
  );
};

/**
 * Split an array into multiple arrays of a given size
 *
 * @param {array} arr - Array to split
 * @param {number} size - Size of each array
 * @returns {array} - Array of arrays
 */
const splitArray = (arr, size) =>
  arr.reduce((acc, curr, i) => {
    size = size || 1; // null handler
    if (i % size === 0) acc.push([curr]);
    else acc[acc.length - 1].push(curr);
    return acc;
  }, []);

const sliceObject = (obj, role = []) =>
  Object.entries(obj).reduce(
    (current, [key, value]) =>
      role.includes(key)
        ? { ...current, selected: { ...current.selected, [key]: value } }
        : { ...current, sliced: { ...current.sliced, [key]: value } },
    { selected: {}, sliced: {} }
  );

const updateData = async (data, id) => {
  if (!id) return 0;
  // const db = new Query();
  const sql = `UPDATE DataAbsensi SET ? WHERE Z = ${id};`;

  const res = (await db(sql, data))?.affectedRows;
  return res;
};

const updateMultipleData = async (data = []) => {
  return await Promise.all(
    data.map(async (item) => {
      const { selected, sliced } = sliceObject(item, ["Z"]);
      return await updateData(sliced, selected?.Z);
    })
  );
};

/**
 * Writes data to a file synchronously.
 *
 * @param {string} path - The path of the file where data should be written.
 * @param {string} [data=""] - The data to write to the file. Defaults to an empty string.
 * @returns {undefined} - No return value.
 */
const writeToFile = (path, data) => {
  try {
    if (isObject(data)) data = JSON.stringify(data);
    fs.writeFileSync(path, data, { flag: "w" });
  } catch (error) {
    throw error;
  }
};

const splitByCategory = (array, categoryKey) => {
  const grouped = array.reduce((result, item) => {
    const category = item[categoryKey];
    if (!category) return result;
    (result[category] = result[category] || []).push(item);
    return result;
  }, {});

  return Object.values(grouped);
};

const formatSize = (bytes) => {
  return (bytes / 1024).toFixed(2) + " KB";
};

const _error = (error, message) => {
  const e = new Error();
  e.message = message;
  e.name = error;

  return e;
};

const copyTheFile = (source, destination) => {
  fs.copyFile(source, destination, (err) => {
    if (err) throw err;
  });
};

const moveFile = async (source, destination) => {
  return new Promise((resolve, reject) => {
    fs.rename(source, destination, (err) => {
      if (err) reject(err);
      resolve(true);
    });
  });
};

const listOfFolder = (path) => {
  const _files = fs.readdirSync(path, { withFileTypes: true });
  return _files.reduce(
    (acc, file) =>
      file.isDirectory()
        ? { ...acc, folders: [...acc.folders, file] }
        : { ...acc, files: [...acc.files, file] },
    { files: [], folders: [] }
  );
};

const findFile = async (startPath, name, deepDepth = true) => {
  let files = fs.readdirSync(startPath, { withFileTypes: true });
  let data = [];

  // get folder
  if (deepDepth) {
    const folders = files.filter((item) => item.isDirectory());
    const foundFromFolder = await Promise.all(
      folders.map((item) =>
        findFile(path.join(startPath, item.name), name, deepDepth)
      )
    );

    data.push(foundFromFolder?.flat());
  }

  const foundFiles = files
    ?.filter((item) => !item.isDirectory())
    ?.find((item) => item.name === name);
  data.push(foundFiles ?? []);

  return data?.flat() ?? [];
};

const listFile = (_path, option = { recursive: false, get: [] }) => {
  let files = fs.readdirSync(_path, { withFileTypes: true });
  return (
    files
      .reduce(
        (acc, file) =>
          file.isDirectory()
            ? option?.recursive
              ? [
                  ...acc,
                  ...listFile(path.join(file?.parentPath, file?.name), {
                    recursive: option?.recursive,
                  }),
                ]
              : acc
            : [...acc, file],
        []
      )
      // get item, parentPath/name or all
      .map((item) =>
        option?.get?.length > 0
          ? (() => {
              const fileDetail = sliceObject(item, option?.get)?.selected;
              if (option?.get?.length > 1) return fileDetail;
              else if (option?.get?.length === 1)
                return fileDetail?.[option?.get?.[0]];
            })()
          : item
      )
  );
};

const createFolder = async (_path) => {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(_path)) fs.mkdirSync(_path);
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  isEmptyObject,
  splitArray,
  sliceObject,
  updateData,
  updateMultipleData,
  writeToFile,
  formatSizeToKB: formatSize,
  _error,
  splitByCategory,
  copyTheFile,
  moveFile,
  findFile,
  listOfFolder,
  listFile,
  isInteger,
  parseInteger,
  arrayOfObjectGet,
  createFolder,
};
