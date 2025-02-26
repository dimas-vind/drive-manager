const { parentPort, workerData } = require("worker_threads");
const { setAuthentication } = require("./helper");
const { downloadFile } = require("../lib/read.drive");

setAuthentication();

(async () => {
  const data = workerData?.data;
  const result = await Promise.all(
    data.map(async (item) => {
      const result = await downloadFile(item);
      return result;
    })
  );

  parentPort.postMessage(result);
})();
