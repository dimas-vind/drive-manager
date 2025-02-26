const { Init } = require("./auth/auth");
const { db } = require("./lib/db_services/library");
const { sliceObject, splitArray, writeToFile } = require("./lib/library");
const { getFileByID } = require("./lib/read.drive");
const { setAuthentication } = require("./worker/helper");
const { Worker } = require("worker_threads");

setAuthentication();
console.log("Waiting response from database");

const restore = async () => {
  // const auth = await new Init().getNewAuth();
  // writeToFile(__dirname + "/worker/auth.json", auth);

  const workerThread = 20;

  let data = await db(
    `SELECT * FROM DataAbsensi WHERE ID NOT LIKE "%https%" AND ID != "" AND ID != "NoFile" AND (tempName = "" OR tempName IS NULL) ORDER BY DataAbsensi.Z DESC;`
  );

  data = await Promise.all(
    data.map((item) => {
      const { selected, sliced } = sliceObject(item, ["Z", "ID"]);

      return selected;
    })
  );

  console.clear();
  console.log({ info: `Data found: ${data.length}` });

  data = splitArray(data, 200);

  const dataWorker = splitArray(data, Math.round(data.length / workerThread));

  console.log({ info: `Worker: ${dataWorker.length}` });
  let result = {
    completeWorker: 0,
    errorWorker: 0,
    data: [],
  };
  for (const [index, _theData] of dataWorker.entries()) {
    const worker = new Worker(__dirname + "/worker/getFileId.worker.js", {
      workerData: { data: _theData, id: index },
    });

    worker.on("message", (result) => {
      result.data = [...(result.data || []), ...result?.flat()];
      console.log({ info: `Worker ${index} complete` });
      result.completeWorker += 1;
    });

    worker.on("error", (error) => {
      console.log({
        info: `Worker ${index} error`,
        error,
        errorDetail: error?.status || error?.response?.status,
      });
      result.errorWorker += 1;

      if (dataWorker.length === result.completeWorker + result.errorWorker) {
        if (result.errorWorker > 0) restore();
      }
    });

    worker.on("exit", (code) => {
      console.log({ info: `Worker ${index} exit`, code });
      if (dataWorker.length === result.completeWorker + result.errorWorker) {
        console.log({ info: "All worker complete", result });
      }
    });
  }

  if (result.data.length > 0) await restore();
  else "No data found";
};

(async () => {
  await restore();
})();
