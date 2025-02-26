const { parentPort, workerData } = require("worker_threads");
const { setAuthentication } = require("./helper");
const { getFileByID, downloadFile } = require("../lib/read.drive");
const { db } = require("../lib/db_services/library");
const { state } = require("../lib/state");
const path = require("path");

setAuthentication();

(async () => {
  const data = workerData?.data;

  let complete = 0;
  const resultData = [];
  for (const theData of data) {
    const _data = await Promise.all(
      theData.map(async (item) => {
        const result = await getFileByID(item.ID);

        complete++;
        console.log(
          `\r Worker ${workerData.id} ->  ${(
            (complete / data.flat().length) *
            100
          ).toFixed(2)} % ${complete}/${data.flat().length}`
        );

        await downloadFile({
          _fileName: result?.data?.name,
          fileId: item.ID,
          folderPath: "",
        });

        await db(`UPDATE DataAbsensi SET ? WHERE Z = ${item.Z};`, {
          tempName: result?.data?.name,
        });

        return {
          ...item,
          idGD: result?.data?.id,
          name: result?.data?.name,
        };
      })
    );

    resultData.push(_data);
  }

  parentPort.postMessage(resultData);
})();
