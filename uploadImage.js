const { state } = require("./lib/state");
const path = require("path");
const { db } = require("./lib/db_services/library");
const {
  listFile,
  splitArray,
  sliceObject,
  splitByCategory,
  isEmptyObject,
  writeToFile,
  updateData,
  arrayOfObjectGet,
} = require("./lib/library");
const { Worker } = require("worker_threads");
const { getFolderID, getFileByID } = require("./lib/read.drive");
const { setAuthentication } = require("./worker/helper");
const { Init } = require("./auth/auth");
const temp = require("./temp.json");

setAuthentication();

let currentPage = 0;
const numberOfWorker = 20;
const basePath = "C:/Users/PROG2/Documents/dest/downloadBox";
state.rootDir = path.resolve(basePath);

state.data = [];
state.tempData = [];
state.allData = [];
state.uploadedData = [];
state.waitingRoom = [];
state.folders = [];
state.progress = 0;
state.addPairingProgress = function (data) {
  state.progress += data;
};
state.addUploadProgress = function (data) {
  state.progress += data;
};
state.resetProgress = function () {
  state.progress = 0;
};
state.addData = function (data) {
  state.data = [...state.data, data];
  state.tempData = [...state.tempData, data];
};
state.addUploadedData = function (data) {
  state.uploadedData = [...state.uploadedData, data];
};
state.setData = function (data) {
  state.data = data;
};
state.setTempData = function (data) {
  state.tempData = data;
};
state.setWaitingRoom = function (data) {
  state.waitingRoom = data;
};
state.setAllData = function (data) {
  state.allData = data;
};
state.setFolders = function (data) {
  state.folders = data;
};

const _init = async () => {
  console.clear();
  console.log(`Waiting for get file info from local disk ...`);

  let allData = listFile(state.rootDir, {
    recursive: true,
    get: ["parentPath", "name"],
  });

  const invalidData = allData.filter(
    (item) => !item?.parentPath || !item?.name
  );
  if (invalidData?.length > 0) {
    writeToFile(path.join(__dirname, "invalidData.json"), { invalidData });
  }

  console.clear();
  console.log("Formating data ...");
  if (invalidData?.length > 0)
    console.log({ invalidData: invalidData?.length });
  let progress = 0;
  allData = await Promise.all(
    allData.map((item) => {
      const date = item?.parentPath?.split("\\").slice(-2);

      progress++;
      process.stdout.write(
        `\r${progress}/${allData.length} | ${(
          (progress / allData.length) *
          100
        ).toFixed(2)}%`
      );
      return {
        ...item,
        date: JSON.stringify(date),
        year: date?.[0],
        month: date?.[1],
      };
    })
  );

  console.clear();
  console.log("Get Folder by parent path");
  const folders = [...new Set(allData.map((item) => item?.date))];

  console.clear();
  console.log(`Waiting Response from Database`);
  const _data = await db(
    `SELECT Z, tempName, ID FROM DataAbsensi WHERE tempName IS NOT NULL AND id_old IS NULL;`
  );
  const waitingRoom = splitArray(_data, 100000);

  state.dispatch("setWaitingRoom", [waitingRoom]);
  state.dispatch("setAllData", [allData]);
  state.dispatch("setFolders", [
    folders.map((item) => {
      const date = JSON.parse(item);
      return {
        year: date?.[0],
        month: date?.[1],
        date: item, // for filtering by date folder
      };
    }),
  ]);
};

const pairingData = async (page) => {
  const masterDataLength = state.waitingRoom?.flat().length;
  let data = state.waitingRoom?.[page];

  console.clear();
  console.log({
    FromDisk: state.allData.length,
    processedData: state.data.length,
    totalData: state.waitingRoom?.flat().length,
    sampleData: data ? undefined : state?.data?.slice(0, 10),
  });

  if (!data) {
    state.dispatch("resetProgress", []);
    await uploadData();
    // writeToFile(path.join(__dirname, "/temp.json"), { temp: state.data });
    return;
  }

  data = splitArray(data, 1000);
  const dataWorker = splitArray(data, Math.round(data.length / numberOfWorker));
  let finishedWorker = 0;

  console.log({
    currentPage,
    Worker: dataWorker.length,
    prosessingData: data?.flat().length,
  });

  dataWorker.forEach((distributedData, index) => {
    const worker = new Worker("./worker/upload.worker.js", {
      workerData: {
        data: distributedData,
        allData: state.allData,
        execute: "pairing",
      },
    });

    worker.on("message", (result) => {
      console.log({ result });

      const { selected, sliced } = sliceObject(result, ["pairedCount"]);
      state.dispatch("addPairingProgress", [selected?.pairedCount]);
      state.dispatch("addData", [sliced]);
    });

    worker.on("error", (error) => {
      console.log({ info: `Worker ${index} error`, error });
    });

    worker.on("exit", (code) => {
      finishedWorker++;
      console.log({ info: `Worker ${index} exit`, code, finishedWorker });

      if (finishedWorker === dataWorker.length) {
        currentPage++;

        global?.gc();
        pairingData(currentPage);
      }
    });

    state.subscribe("addPairingProgress", (_, action, store) => {
      process.stdout.write(
        "\r" +
          JSON.stringify({
            current:
              ((state.progress / masterDataLength) * 100).toFixed(2) + "%",
            total: state.progress,
          })
      );
    });
  });
};

const checkFolder = async () => {
  try {
    const folders = state.folders;

    console.clear();
    console.log("Get Folder ID From Google Drive ...");
    let progress = 0;
    for (const folder of folders) {
      let folderId = await getFolderID(folder.month, {
        parent: folder.year,
        createNew: true,
      });
      folderId = folderId.data.files[0].id;

      state.dispatch("setAllData", [
        state.allData.map((item) =>
          item.date === folder.date ? { ...item, folderId } : item
        ),
      ]);

      progress++;
      process.stdout.write(
        `\r${progress}/${folders.length} | ${(
          (progress / folders.length) *
          100
        ).toFixed(2)}%`
      );
    }
  } catch (error) {
    if (error?.response?.status === 400) {
      await new Init().writeAuth();
      await checkFolder();
    }
  }
};

const uploadData = async () => {
  if (state.data?.length === 0) {
    console.clear();
    console.log({
      info: "No data to upload",
    });

    setTimeout(async () => {
      await verify();
    }, 2000);
  }

  let isAuthenticated = true;
  let completeWorker = 0;
  const workerlist = [];
  const dataLength = state.data?.length;
  // const dataWorker = splitByCategory(state.data, "folderId");
  const dataWorker = splitArray(state.data, Math.round(dataLength / 65));

  const stopWorker = () => {
    for (const worker of workerlist) {
      worker.terminate();
    }
  };

  const uncompleteCheck = () => {
    console.clear();
    console.log({ info: "Checking data uncompleted upload" });
    let progress = 0;
    const _alldata = state.data?.length;

    if (_alldata === 0) return;

    state.dispatch("setData", [
      (async () => {
        const uploaded = arrayOfObjectGet(
          state.uploadedData,
          Object.keys(state.data?.flat()?.[0])
        ).map((updated) => JSON.stringify(updated));
        const _splitedData = splitArray(state.data, 1000);
        const data = await Promise.all(
          _splitedData.map(async (item) => {
            return item.reduce(async (current, data) => {
              const currentData = !uploaded.includes(JSON.stringify(data))
                ? current
                : [...current, data];

              progress++;
              process.stdout.write(
                `\r${progress}/${_alldata} | ${(
                  (progress / _alldata) *
                  100
                ).toFixed(2)}%`
              );
              return currentData;
            }, []);
          })
        );

        return data?.flat();
      })(),
    ]);
    // state.data.filter((item) => {
    //   const _c = !arrayOfObjectGet(state.uploadedData, Object.keys(item))
    //     .map((updated) => JSON.stringify(updated))
    //     .includes(JSON.stringify(item));

    //   progress++;
    //   process.stdout.write(
    //     `\r${progress}/${_alldata} | ${((progress / _alldata) * 100).toFixed(
    //       2
    //     )}%`
    //   );

    //   return _c;
    // }),

    uploadData();
  };

  console.clear();
  console.log({
    info: "Uploading Image",
    Worker: dataWorker.length,
    dataLength,
  });
  dataWorker.forEach((distributedData, index) => {
    const worker = new Worker("./worker/upload.worker.js", {
      workerData: {
        data: distributedData,
        execute: "upload",
      },
    });

    worker.on("message", (result) => {
      const { selected, sliced } = sliceObject(result, [
        "uploadedCount",
        "data",
      ]);
      state.dispatch("addUploadProgress", [selected?.uploadedCount]);
      state.dispatch("addUploadedData", [selected?.data]);
    });

    worker.on("error", async (error) => {
      console.log({ info: `Worker ${index} error`, error });

      if (error?.message === "Authentication Failed" && isAuthenticated) {
        isAuthenticated = false;
        stopWorker();
        await new Init().writeAuth();
        isAuthenticated = true;
        uncompleteCheck();
      }
    });

    worker.on("exit", (code) => {
      completeWorker++;
      console.log({ info: `Worker ${index} exit`, code });

      if (dataWorker.length === completeWorker && isAuthenticated) {
        console.clear();
        console.log({
          FromDisk: state.allData.length,
          processedData: state.data.length,
          uploadData: state.uploadedData.length,
        });

        // CHECKING UNCOMPLETE DATA
        uncompleteCheck();
      }
    });

    workerlist.push(worker);
  });

  state.subscribe("addUploadProgress", (_, action, store) => {
    process.stdout.write(
      "\r" +
        JSON.stringify({
          current: ((state.progress / dataLength) * 100).toFixed(2) + "%",
          total: state.progress + "/" + dataLength,
          remainingWorker: workerlist.length - completeWorker,
        })
    );
  });
};

const verify = async () => {
  console.clear();
  console.log({ info: "Verifying uploaded data..." });
  const uploadedFromDB = await db(
    "SELECT * FROM DataAbsensi WHERE id_old IS NOT NULL;"
  );
  const uploadedData = state.uploadedData.filter((item) => item?.newID);
  const notUploadedData = state.uploadedData.filter((item) => !item?.newID);

  return console.log({
    uploadedData: uploadedData?.length,
    uploadedFromDB: uploadedFromDB?.length,
    notUploadedData: notUploadedData?.length,
  });
};

const verifyFromGD = async () => {
  console.clear();
  console.log({ info: "Verifying uploaded data from GD..." });
  state.verifyData = [];
  state.verifiedData = [];
  state.verifyProgress = 0;
  state.addVerifiedData = function (data) {
    state.verifiedData = [...state.verifiedData, data];
  };
  state.setVerifiedData = function (data) {
    state.verifiedData = data;
  };
  state.setVerifyData = function (data) {
    state.verifyData = data;
  };
  state.addVerifyData = function (data) {
    state.verifyData = [...state.verifyData, data];
  };
  state.setVerifyProgress = function (data) {
    state.verifyProgress += data;
  };

  const data = await db("SELECT * FROM DataAbsensi WHERE id_old IS NOT NULL;");
  console.log({ info: `Found ${data?.length} data` });
  state.dispatch("setVerifyData", [data]);

  const getUnverifiedData = async () => {
    console.clear();
    console.log({ info: "Getting unverified data..." });
    const _verified = state.verifiedData?.map((item) => JSON.stringify(item));
    const _data = state.verifyData;
    state.dispatch("setVerifiedData", [[]]);
    state.dispatch("setVerifyData", [[]]);

    let progress = 0;
    const dataLength = _verified.length;

    const dummyData = _data.map((item) => JSON.stringify(item));
    const result = await Promise.all(
      splitArray(_verified, 10000).map(async (_item) => {
        return await Promise.all(
          splitArray(_item, 1000).map(async (item) => {
            return await Promise.all(
              item.map(async (data) => {
                // if (!_verified.includes(JSON.stringify(data))) {
                //   state.dispatch("addVerifyData", [data]);
                // }
                const index = dummyData?.indexOf(data);
                if (index !== -1) _data.splice(index, 1);

                state.dispatch("setVerifyData", [_data]);

                progress++;
                process.stdout.write(
                  `\r${progress}/${dataLength} | ${(
                    (progress / dataLength) *
                    100
                  ).toFixed(2)}%`
                );
              })
            );
          })
        );
      })
    );

    return state.verifyData;
  };

  const result = {
    found: 0,
    notFound: 0,
    total: data.length,
  };

  state.subscribe("setVerifyProgress", (_, action, store) => {
    process.stdout.write(
      "\r" +
        JSON.stringify({
          found: result.found,
          notFound: result.notFound,
          total: result.total,
        })
    );
  });

  const _main = async (dataUpdated) => {
    const dataWorker = splitArray(
      dataUpdated,
      Math.round(dataUpdated.length / 50)
    );
    const workerList = [];
    let completeWorker = 0;

    const terminateWorker = () => {
      for (const worker of workerList) {
        worker.terminate();
      }
    };

    console.clear();
    console.log({
      Worker: dataWorker.length,
      prosessingData: dataUpdated?.length,
      data: result.total,
    });
    let isAuthenticated = true;
    let onlineWorker = 0;
    dataWorker.forEach((distributedData, index) => {
      const worker = new Worker("./worker/upload.worker.js", {
        workerData: {
          data: distributedData,
          execute: "verify",
        },
      });

      worker.on("message", (_result) => {
        if (_result.found === 1)
          state.dispatch("addVerifiedData", [_result.data]);

        result.found += _result.found;
        result.notFound += _result.notFound;
        state.dispatch("setVerifyProgress", [_result.found + _result.notFound]);
      });

      worker.on("online", () => {
        onlineWorker++;
        if (onlineWorker === dataWorker.length) {
          console.log({ info: "All worker online" });
        }
      });

      worker.on("error", async (error) => {
        console.log(error);
        if (error?.message === "Authentication Failed" && isAuthenticated) {
          isAuthenticated = false;
          terminateWorker();
          await new Init().writeAuth();
          await getUnverifiedData();
          isAuthenticated = true;
          _main(state.verifyData);
        }
      });

      worker.on("exit", async (code) => {
        completeWorker++;
        console.log({ info: `Worker ${index} exit with code ${code}` });

        if (dataWorker.length === completeWorker && isAuthenticated) {
          terminateWorker();
          console.clear();
          console.log(result);
        }
      });

      workerList.push(worker);
    });
  };

  return await _main(data);
};

(async () => {
  // const auth = await new Init().writeAuth();

  // if (isEmptyObject(temp)) {
  //   await _init();
  //   await checkFolder();
  //   await pairingData(currentPage);
  // } else {
  //   state.dispatch("setData", [temp?.temp]);
  // }

  // await uploadData();

  await _init();

  if (state.waitingRoom.length === 0) {
    await verifyFromGD();
    return;
  }

  await checkFolder();
  await pairingData(currentPage);

  return;
})();
