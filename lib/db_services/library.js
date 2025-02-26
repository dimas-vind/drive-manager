const { connection, newPool } = require("./config");

const db = async (sql, data) => {
  const [result, fields] = await connection.query(sql, data);
  return result;
};

class Query {
  /**
   * Query class, independent connection pool
   *
   * @description The query object is used to execute SQL queries,
   * it used the connection object to execute the query with independent connection pool
   * @param {string} sql - SQL query to execute
   * @param {array} data - Data to bind to query
   */
  constructor(sql = "", data = null) {
    this.sql = sql;
    this.data = data;
    this.connection = newPool();
    this.isTransaction = false;
  }

  async execute() {
    try {
      const [result, fields] = await this.connection.query(this.sql, this.data);
      if (!this.isTransaction) await this.connection.end();

      return result;
    } catch (error) {
      if (!this.isTransaction) await this.connection.end();

      throw error;
    }
  }

  /**
   * Execute Raw SQL, used to execute query that not support by ORM.
   *
   * @param {string} sql - Raw SQL query to execute
   * @param {array} data - Data to bind to query
   * @return {Promise<Object|Array<Object>>} - result of query
   */
  async executeRawSql(sql, data) {
    this.sql = sql;
    this.data = data;
    return await this.execute();
  }

  async transaction() {
    this.isTransaction = true;
    this.sql = "START TRANSACTION;";
    await this.execute();
  }

  async commit() {
    if (!this.isTransaction) return;
    this.sql = "COMMIT;";
    await this.execute();
    await this.connection.end();
    this.isTransaction = false;
  }

  async rollback() {
    if (!this.isTransaction) return;
    this.sql = "ROLLBACK;";
    await this.execute();
    await this.connection.end();
    this.isTransaction = false;
  }
}

/**
 * Only get the object with the given role
 *
 * @param {array} arrayOfObject - Array of objects
 * @param {array} role - Role of the object to get
 * @return {array} - Array of objects with the given role
 */
const onlyGet = (arrayOfObject, role = []) =>
  arrayOfObject.map((item) =>
    Object.entries(item).reduce(
      (current, [key, value]) =>
        role.includes(key) ? { ...current, [key]: value } : current,
      {}
    )
  );

module.exports = { Query, onlyGet, db };
