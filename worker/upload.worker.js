const { workerData, parentPort } = require("worker_threads");
const { uploadFile } = require("../lib/write.drive");
const path = require("path");
const { setAuthentication } = require("./helper");
const { _error, splitArray, sliceObject } = require("../lib/library");
const { Query, db } = require("../lib/db_services/library");
const { state } = require("../lib/state");
const { adsense } = require("googleapis/build/src/apis/adsense");
const { getFileByID } = require("../lib/read.drive");

setAuthentication();
state.uploadedData = [];
state.tempData = {}; // only for debugging
state.setUploaded = function (data) {
  state.uploadedData = data;
};
state.setTempData = function (data) {
  state.tempData = data;
};

// Update to database
state.subscribe("setUploaded", async (data, action, store) => {
  await db(`UPDATE DataAbsensi SET ? WHERE Z = ${data.data.Z};`, {
    ID: data?.data.newID,
    id_old: data.data.ID,
  });
});

const upload = async () => {
  try {
    let data = workerData?.data;

    for (const item of data) {
      try {
        state.dispatch("setTempData", [item]);
        const filePath = path.join(item.parentPath, item.name);
        const result = await uploadFile({
          fileName: item.name,
          filePath,
          folderId: item.folderId,
        });
        const report = {
          // ...item,
          // newID: result?.data?.id,
          uploadedCount: 1,
          data: { ...item, newID: result?.data?.id },
        };

        state.dispatch("setUploaded", [report]); // update to database
        parentPort.postMessage(report);
      } catch (error) {
        if (
          error?.response?.status === 400 &&
          error?.response?.data?.error_description ===
            "Could not determine client ID from request."
        ) {
          throw _error("Error 400", "Authentication Failed");
        }

        parentPort.postMessage({
          data: item,
          uploadedCount: 1,
        });

        continue;
      }
    }

    return;
    // }
  } catch (error) {
    // if (
    //   error?.response?.status === 400 &&
    //   error?.response?.data?.error_description ===
    //     "Could not determine client ID from request."
    // ) {
    //   throw _error("Error 400", "Authentication Failed");
    // }

    console.log({ error: error?.message, data: state.tempData });
    throw error;
  }
};

const pairing = async () => {
  const { data, allData } = workerData;

  try {
    return await Promise.all(
      data.map(async (splited) => {
        return await Promise.all(
          splited.map((item) => {
            const found = allData.find(
              (item2) => item2?.name === item?.tempName
            );

            const result = {
              ...found,
              ...item,
              pairedCount: 1,
            };

            parentPort.postMessage(result);
            // global.gc();
            return result;
          })
        );
      })
    );
  } catch (error) {
    throw error;
  }
};

const verifyId = async () => {
  let data = workerData?.data;
  data = splitArray(data, 100);

  // const result = await Promise.all(
  //   data.map(async (item) => {
  for (const item of data) {
    const result = await Promise.all(
      item.map(async (_updated) => {
        const { selected, sliced } = sliceObject(_updated, ["ID"]);
        try {
          const found = await getFileByID(selected?.ID);
          parentPort.postMessage({
            found: 1,
            notfound: 0,
            data: _updated,
          });
        } catch (error) {
          if (error.response.status === 404)
            parentPort.postMessage({
              found: 0,
              notfound: 1,
              data: _updated,
            });

          if (
            error?.response?.status === 400 &&
            error?.response?.data?.error_description ===
              "Could not determine client ID from request."
          ) {
            throw _error("Error 400", "Authentication Failed");
          }

          throw error;
        }
      })
    );
  }
  // })
  // );
};

(async () => {
  try {
    if (workerData?.execute === "pairing") pairing();
    if (workerData?.execute === "upload") upload();
    if (workerData?.execute === "verify") verifyId();
  } catch (error) {
    throw error;
  }
})();
