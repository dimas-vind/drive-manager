const { Init } = require("./auth/auth");
const { main } = require("./main");

(async () => {
  // Initialize the auth object and set to state
  await new Init().getNewAuth();
  await main();
})();
