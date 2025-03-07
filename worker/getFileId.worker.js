const { parentPort, workerData } = require("worker_threads");
const { setAuthentication } = require("./helper");
const { getFileByID, downloadFile } = require("../lib/read.drive");
const { Query } = require("../lib/db_services/library");
const { state } = require("../lib/state");
const path = require("path");
const { _error, sliceObject } = require("../lib/library");

setAuthentication();

// state.rootDir = __dirname.split("\\").slice(0, -1).join("\\");
const destination = "C:/Users/PROG2/Documents/dest";
state.rootDir = path.resolve(destination);

(async () => {
  const data = workerData?.data;
  let complete = 0;

  try {
    const result = await Promise.all(
      data.map(async (theData) => {
        const downloadData = await Promise.all(
          theData.map(async (item) => {
            try {
              const result = await getFileByID(item.ID);

              // rewrite on first
              const downloadedFile = await downloadFile({
                _fileName: result?.data?.name,
                fileId: item.ID,
                folderPath: "",
                option: {
                  progress: false,
                  // onSame: "skip", // comment this code only for verify
                },
              });

              complete++;
              console.log(
                `\r Worker ${workerData.id} on download ->  ${(
                  (complete / data.flat().length) *
                  100
                ).toFixed(2)} % ${complete}/${data.flat().length}`
              );
              return {
                result: {
                  name: result?.data?.name,
                  id: item.ID,
                },
                update: {
                  Z: item.Z,
                  tempName: result?.data?.name,
                },
              };
            } catch (error) {
              if (error?.response?.status === 404) {
                console.log({
                  info: `Worker ${workerData.id} -> File not found`,
                  detail: `File not found: ${item.ID}`,
                });

                return {
                  update: {
                    Z: item.Z,
                    not_found: item.ID,
                  },
                };
              }

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

        const db = new Query();
        db.transaction();

        complete = 0;
        const updateDb = await Promise.all(
          downloadData.map(async (item) => {
            const { selected, sliced } = sliceObject(item?.update, ["Z"]);
            try {
              const updatedFile = await db.executeRawSql(
                `UPDATE DataAbsensi SET ? WHERE Z = ${selected.Z};`,
                sliced
              );

              complete++;
              console.log(
                `\r Worker ${workerData.id} on update ->  ${(
                  (complete / data.flat().length) *
                  100
                ).toFixed(2)} % ${complete}/${data.flat().length}`
              );

              return {
                ...item,
                updated: updatedFile?.affectedRows,
              };
            } catch (error) {
              db.rollback();
              throw error;
            }
          })
        );

        db.commit();
        return updateDb;
      })
    );

    parentPort.postMessage(result);
  } catch (error) {
    throw error;
  }
})();
