const { Init } = require("./auth/auth");
const { db } = require("./lib/db_services/library");
const { sliceObject, splitArray, writeToFile } = require("./lib/library");
const { getFileByID } = require("./lib/read.drive");
const { setAuthentication } = require("./worker/helper");
const { Worker } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { state } = require("./lib/state");

const destination = "C:/Users/PROG2/Documents/dest/downloadBox";
state.rootDir = path.resolve(destination);

let isAuthenticating = false;
setAuthentication();
console.log("Waiting response from database");

const restore = async () => {
  const workerThread = 20;
  isAuthenticating = false;

  let data = await db(
    `SELECT * FROM DataAbsensi WHERE ID NOT LIKE "%https%" AND ID != "" AND ID != "NoFile" AND (tempName = "" OR tempName IS NULL) AND not_found IS NULL ORDER BY DataAbsensi.Z DESC LIMIT 2000;`
  );
  let dataCount = await db(
    `SELECT COUNT(*) length FROM DataAbsensi WHERE ID NOT LIKE "%https%" AND ID != "" AND ID != "NoFile" AND (tempName = "" OR tempName IS NULL) AND not_found IS NULL`
  );

  if (data.length === 0) {
    console.clear();
    console.log("Verifying data...");
    const processedData = await db(
      `SELECT tempName FROM DataAbsensi WHERE tempName IS NOT NULL ORDER BY DataAbsensi.Z DESC`
    );

    console.log(`Found ${processedData.length} data`);
    // console.log({
    //   data: processedData.map((item) => item?.tempName),
    //   cek: path.join(state.rootDir, processedData[0]?.tempName),
    // });

    // return;

    const result = {
      notExist: 0,
      isExist: 0,
      notExistData: [],
    };

    console.clear();
    let progress = 0;
    const splitedData = splitArray(processedData, 2000);
    const verifyData = await Promise.all(
      splitedData.map((item) => {
        return Promise.all(
          item.map((tempNameData) => {
            progress += 1;
            process.stdout.write(
              `\rVerifying data... ${progress}/${processedData.length}`
            );
            return fs.existsSync(
              path.join(state.rootDir, tempNameData?.tempName)
            )
              ? (result.isExist += 1)
              : (() => {
                  result.notExist += 1;
                  result.notExistData.push(tempNameData);
                })();
          })
        );
      })
    );

    console.clear();
    return console.log(result);
  }

  data = await Promise.all(
    data.map((item) => {
      const { selected, sliced } = sliceObject(item, ["Z", "ID"]);

      return selected;
    })
  );

  console.clear();
  console.log({
    info: `Data found: ${data.length}`,
    of: dataCount?.[0]?.length,
  });

  data = splitArray(data, 100);
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

    worker.on("message", (_result) => {
      result.completeWorker += 1;
      console.log({
        ...result,
        info: `Worker ${index} complete`,
        remaining:
          dataWorker.length - (result.errorWorker + result.completeWorker),
      });

      if (
        dataWorker.length === result.completeWorker + result.errorWorker &&
        !isAuthenticating
      ) {
        setTimeout(async () => {
          await restore();
        }, 2000);
      }
    });

    worker.on("error", (error) => {
      result.errorWorker += 1;
      console.log({
        info: `Worker ${index} error`,
        error,
        errorDetail: error?.status || error?.response?.status,
      });

      if (error.message === "Authentication Failed" && !isAuthenticating) {
        (async () => {
          isAuthenticating = true;
          await new Init().writeAuth();

          if (dataWorker.length === result.completeWorker + result.errorWorker)
            await restore();
        })();
      }

      if (
        dataWorker.length === result.completeWorker + result.errorWorker &&
        !isAuthenticating
      ) {
        setTimeout(async () => {
          await restore();
        }, 2000);
      }
    });

    worker.on("exit", () => {
      // console.log({ info: `Worker ${index} exit`, code });
      if (dataWorker.length === result.completeWorker + result.errorWorker) {
        console.log({ info: "All worker complete", result });
      }
    });
  }

  // await restore();
};

(async () => {
  await restore();
})();
