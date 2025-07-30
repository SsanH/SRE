// Docker Environment Configuration
module.exports = {
  database: {
    host: process.env.DB_HOST || 'tidb',
    port: parseInt(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tidb_assignment',
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
    ...(process.env.DB_SSL === 'true' && {
      ssl: {
        rejectUnauthorized: false
      }
    })
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    clientId: 'tidb-sre-assignment'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'tidb-sre-assignment-secret-key-2024'
  },
  server: {
    port: parseInt(process.env.PORT) || 3001
  }
};