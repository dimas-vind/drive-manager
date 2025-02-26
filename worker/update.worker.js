const { Query } = require("../lib/db_services/library");
const { parentPort, workerData } = require("worker_threads");
const { sliceObject } = require("../lib/library");

const db = new Query();
db.transaction();

const updateData = async (data, id) => {
  if (!id) return 0;
  const sql = `UPDATE DataAbsensi SET ? WHERE Z = ${id};`;

  const res = (await db.executeRawSql(sql, data))?.affectedRows;
  return res;
};

/**
 * Update multiple data in DataAbsensi table
 *
 * @param {array} data - Array of objects with the following properties:
 *  - Z: The ID of the data to update
 *  - other properties: The data to update
 * @return {Promise<number[]>} - Array of numbers, where each number
 *  represents the number of affected rows of the corresponding data
 */
const updateMultipleData = async (data = []) => {
  return await Promise.all(
    data.map(async (item) => {
      const { selected, sliced } = sliceObject(item, ["Z"]);
      return await updateData(sliced, selected?.Z);
    })
  );
};

(async () => {
  let updated = 0;
  const res = await Promise.all(
    workerData.data.map(async (item, index) => {
      const result = await updateMultipleData(item);

      updated += result.length;
      const persentage = (updated / workerData.data?.flat()?.length) * 100;
      console.log(
        `\rUpdating Data on Worker ${workerData.id} :${persentage.toFixed(
          2
        )}% (${updated}/${workerData.data?.flat()?.length})\r`
      );

      return result;
    })
  );

  db.commit();
  parentPort.postMessage(res?.flat());
})();
