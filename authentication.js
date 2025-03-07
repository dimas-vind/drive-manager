const { Init } = require("./auth/auth");

(async () => await new Init().writeAuth().then(() => process.exit(0)))();
