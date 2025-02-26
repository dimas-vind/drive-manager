const { workerData, parentPort } = require("worker_threads");
const { uploadImageFromUrl } = require("../lib/write.drive");
const auth = require("./auth.json");
const { state } = require("../lib/state");
const { google } = require("googleapis");
const { getFolderID } = require("../lib/read.drive");

state.auth = "";
state.setAuth = function (_auth) {
  state.auth = _auth;
};

// set authentication
const _auth = new google.auth.OAuth2({
  clientId: auth?._client_id,
  clientSecret: auth?._client_secret,
  redirectUri: auth?.redirect_uris?.[0],
});

_auth.setCredentials({
  access_token: auth?.credentials?.access_token,
  refresh_token: auth?.credentials?.refresh_token,
});

state.dispatch("setAuth", [_auth]);

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
