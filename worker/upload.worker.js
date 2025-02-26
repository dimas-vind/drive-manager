const { workerData, parentPort } = require("worker_threads");
const { uploadImageFromUrl } = require("../lib/write.drive");
const { getFolderID } = require("../lib/read.drive");
const { setAuthentication } = require("./helper");

setAuthentication();

(async () => {
  try {
    const result = await Promise.all(
      workerData.data?.map(async (item) => {
        const { url, year, month, fileName } = item;
        const folderId = await getFolderID(month, { parent: year });

        return await uploadImageFromUrl({ url, fileName, folderId });
      })
    );

    parentPort.postMessage(result);
  } catch (error) {
    console.log(error);
    throw error;
  }
})();
