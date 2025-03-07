const auth = require("./auth.json");
const { google } = require("googleapis");
const { state } = require("../lib/state");
const { isEmptyObject, _error } = require("../lib/library");

state.auth = {};
state.setAuth = function (_auth) {
  state.auth = _auth;
};

const setAuthentication = () => {
  try {
    if (isEmptyObject(auth)) throw _error("Error 401", "Authentication Failed");

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
  } catch (error) {
    throw error;
  }
};

module.exports = { setAuthentication };
