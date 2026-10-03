const mysql = require('mysql2/promise');
require('dotenv').config();

module.exports = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 4000),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,

  ssl: {
    minVersion: 'TLSv1.2'
  },

  waitForConnections: true,
  connectionLimit: 10
});
