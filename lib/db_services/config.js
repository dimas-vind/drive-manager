const mysql = require("mysql2/promise");

const config = {
  host: "localhost",
  user: "root",
  password: "bismillah",
  database: "fresh_class",
  connectionLimit: 10,
  queueLimit: 0,
  waitForConnections: true,
  multipleStatements: true,
  connectTimeout: 10000,
};

// const config = {
//   host: "103.66.86.234",
//   user: "freshgr4_it",
//   password: "Qawsed#@1",
//   database: "freshgr4_class_fresh_coba",
//   connectionLimit: 10,
//   queueLimit: 0,
//   waitForConnections: true,
//   multipleStatements: true,
//   connectTimeout: 10000,
// };

const connection = mysql.createPool(config);
const newPool = () => mysql.createPool(config);

module.exports = { connection, newPool };
