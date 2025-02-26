const { authenticate } = require("@google-cloud/local-auth");
const path = require("path");
const { state } = require("../lib/state");
const { isEmptyObject } = require("../lib/library");

state.auth = {};
state.setAuth = (_auth) => (state.auth = _auth);

const auth = async () =>
  await authenticate({
    keyfilePath: path.join(__dirname, "/credential.json"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

class Init {
  constructor() {
    this.auth = state.auth;
  }

  async getNewAuth() {
    const _auth = await auth();

    this.auth = _auth;
    state.dispatch("setAuth", [_auth]);

    return _auth;
  }
}

module.exports = { auth, Init };
