const { splitArray, writeToFile } = require("./lib/library");
const { getMultipleFileID, getFolderID } = require("./lib/read.drive");
const { onlyGet, db } = require("./lib/db_services/library");
const { state } = require("./lib/state");
const { Worker } = require("worker_threads");

const getDataLink = async () => {
  const sql = `SELECT Z, ID, LinkLokal FROM DataAbsensi WHERE ID LIKE "%https://%";`;

  return (await db(sql))?.map((item) => ({
    ...item,
    ID: item?.ID?.split("/").slice(-1)?.[0]?.toLowerCase(),
    url: item?.ID,
  }));
};

const main = async () => {
  const files = await getDataLink();
  console.clear();
  console.log("Getting Data From DB : " + files.length);
  const newList = splitArray(files, 100);
  let fromGDrive = [];
  const numberOfThreads = 5;

  if (files.length === 0) return console.log("Data Not Found");

  process.stdout.write("\rGetting Data From GDrive...\r");
  const listFiles = await Promise.all(
    newList.map(async (files, index) => {
      let result = (await getMultipleFileID(files?.map((item) => item?.ID)))
        .data?.files;
      result = onlyGet(result, ["id", "name"]);
      fromGDrive.push(result);

      result = result.map((item) => {
        const found = files.find((file) => file.ID === item.name.toLowerCase());

        return {
          Z: found?.Z,
          ID: item?.id,
          LinkLokal: found?.ID,
        };
      });

      // const persentage = ((index + 1) / newList.length) * 100;
      // process.stdout.write(`Pairing Data :${persentage.toFixed(2)}%\r`);

      return result;
    })
  );
  console.clear();
  process.stdout.write(`\rFound Data :${listFiles?.flat()?.length}\r`);

  if (listFiles?.flat()?.length === 0) {
    // Update available data or new data from DB with url
    const source = await Promise.all(
      files.map(async (item) => {
        let date = item?.ID?.split("_").slice(-3)[0];
        const _date = {
          year: date.split("-")[0],
          month: date.split("-")[1],
        };

        return {
          ..._date,
          date: `${_date.year}-${_date.month}`,
          url: item?.url,
          fileName: item?.ID,
        };
      })
    );

    // create year folder if not exist
    const createYearFolder = await Promise.all(
      [...new Set(source?.map((item) => item?.year))].map(async (item) => {
        const res = await getFolderID(item, { createNew: true });
        return {
          year: item,
          folderId: res?.data?.files?.[0]?.id,
        };
      })
    );

    // create month folder if not exist
    const createMonthFolder = await Promise.all(
      [...new Set(source?.map((item) => item?.date))].map(async (item) => {
        const dir = {
          year: item.split("-")[0],
          month: item.split("-")[1],
        };

        return await getFolderID(dir.month, {
          parent: createYearFolder.find((f) => f.year === dir.year)?.folderId,
          createNew: true,
        });
      })
    );

    const dataWorker = splitArray(
      source,
      Math.round(source.length / numberOfThreads)
    );
    let currentWorker = 0;
    let accData = [];
    writeToFile(__dirname + "/worker/auth.json", state.auth);

    dataWorker.forEach((item, index) => {
      const worker = new Worker("./worker/upload.worker.js", {
        workerData: { data: item, id: index },
      });

      worker.on("message", (data) => {
        currentWorker++;
        accData = [...accData, ...data].filter((item) => item); // add and filter undefined or null data

        if (currentWorker === dataWorker?.length) {
          console.clear();
          console.log({
            info: `Worker ${index} finished`,
            sourceData: source?.length,
            uploaded: accData?.length,
          });
          console.log("Trying to update data...");

          setTimeout(async () => {
            writeToFile(__dirname + "/worker/auth.json", {});

            if (accData?.length > 0) main();
            else {
              console.clear();
              console.log("Data not found");
            }
          }, 2000);
        }
      });

      worker.on("error", (error) =>
        console.log({ error, info: `Worker ${index} error` })
      );
      worker.on("exit", (code) => {
        if (code !== 0)
          console.log({
            info: `Worker ${index} stopped with exit code ${code}`,
          });
      });
    });
    return;
  }

  const unknown = listFiles?.filter((item) => item?.length === 0)?.flat();
  let data = listFiles?.filter((item) => item?.length > 0)?.flat(); // flat array
  data = splitArray(data, 1000); // proses 500 data per sekali proses

  // Multithreading for update data
  console.clear();
  const uploaded = [];
  const dataWorker = splitArray(
    data,
    Math.round(data.length / numberOfThreads)
  );
  let currentWorker = 0;

  console.log({
    info: `Working on ${dataWorker?.length} threads`,
    activeWorker: dataWorker?.length,
    data: data?.flat()?.length,
  });
  dataWorker.forEach((item, index) => {
    const worker = new Worker("./worker/update.worker.js", {
      workerData: { data: item, id: index, allData: data.length },
    });

    worker.on("message", (data) => {
      uploaded.push(data);
      currentWorker++;

      if (currentWorker === dataWorker?.length) {
        data = uploaded
          ?.flat()
          .reduce(
            (current, item) =>
              item === 1
                ? { ...current, success: current.success + 1 }
                : { ...current, failed: current.failed + 1 },
            { success: 0, failed: 0 }
          );

        console.clear();
        console.log({
          ...data,
          fromDB: files?.length,
          fromGDrive: fromGDrive?.flat()?.length,
          unknown: unknown?.length,
        });

        if (data.success > 0) {
          console.log(`Trying to update again...`);
          setTimeout(() => {
            main();
          }, 2000);
        }
      }
    });
    worker.on("error", (error) =>
      console.log({ error, info: `Worker ${index} error` })
    );
    worker.on("exit", (code) => {
      if (code !== 0)
        console.log({ info: `Worker ${index} stopped with exit code ${code}` });
    });
  });
};

module.exports = { main };
