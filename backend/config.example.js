// Copy this file to config.js and update with your TiDB credentials

module.exports = {
  database: {
    host: 'gateway01.us-west-2.prod.aws.tidbcloud.com',
    port: 4000,
    user: 'your_tidb_username',
    password: 'your_tidb_password',
    database: 'your_database_name'
  },
  jwt: {
    secret: 'your-super-secret-jwt-key-change-this-in-production'
  },
  server: {
    port: 3001
  }
};