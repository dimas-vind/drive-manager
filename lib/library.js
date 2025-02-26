const fs = require("fs");
const { db } = require("./db_services/library");

const isEmptyObject = (obj) => {
  return !obj || Object.keys(obj).length === 0;
};

const isObject = (obj) => {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
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

module.exports = {
  isEmptyObject,
  splitArray,
  sliceObject,
  updateData,
  updateMultipleData,
  writeToFile,
};
