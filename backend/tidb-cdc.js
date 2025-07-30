// TiDB Change Data Capture (CDC) Implementation
// Monitors database changes and publishes to Kafka

const mysql = require('mysql2/promise');
const { Kafka } = require('kafkajs');
const { StructuredLogger } = require('./logger');

// Use Docker config if NODE_ENV is 'docker', otherwise use local config
const config = process.env.NODE_ENV === 'docker' 
  ? require('./config-docker') 
  : require('./config');

class TiDBCDCService {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'tidb-cdc-service',
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });
    
    this.producer = this.kafka.producer();
    this.db = null;
    this.isRunning = false;
    this.pollingInterval = 5000; // 5 seconds
    this.lastProcessedId = {};
    this.startTime = Date.now();
    this.changesProcessed = 0;
  }

  async start() {
    try {
      // Connect to database
      await this.connectDatabase();
      
      // Connect to Kafka
      await this.producer.connect();
      StructuredLogger.logSystemEvent('CDC_KAFKA_CONNECTED', 'info', {
        brokers: config.kafka.brokers
      });

      // Create CDC tracking table
      await this.createCDCTrackingTable();
      
      // Create database triggers for CDC
      await this.createCDCTriggers();
      
      // Initialize last processed IDs
      await this.initializeLastProcessedIds();
      
      this.isRunning = true;
      
      StructuredLogger.logSystemEvent('CDC_SERVICE_STARTED', 'info', {
        pollingInterval: this.pollingInterval,
        tablesMonitored: ['users', 'user_tokens', 'user_activity_log']
      });

      // Start polling for changes
      this.startPolling();
      
      console.log('🔄 TiDB CDC Service started successfully');
      console.log('📊 Monitoring database changes with structured logging');
      
    } catch (error) {
      StructuredLogger.logSystemEvent('CDC_START_ERROR', 'error', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async connectDatabase() {
    try {
      // Connect without specifying database first
      const connectionConfig = { ...config.database };
      delete connectionConfig.database;
      
      this.db = await mysql.createConnection(connectionConfig);
      await this.db.execute(`USE ${config.database.database}`);
      
      StructuredLogger.logSystemEvent('CDC_DATABASE_CONNECTED', 'info', {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database
      });
      
    } catch (error) {
      StructuredLogger.logSystemEvent('CDC_DATABASE_CONNECTION_ERROR', 'error', {
        error: error.message
      });
      throw error;
    }
  }

  async createCDCTrackingTable() {
    try {
      // Create a table to track database changes
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS cdc_change_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          table_name VARCHAR(100) NOT NULL,
          operation_type ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
          record_id VARCHAR(100),
          old_data JSON,
          new_data JSON,
          user_id INT,
          change_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed BOOLEAN DEFAULT FALSE,
          INDEX idx_table_op (table_name, operation_type),
          INDEX idx_processed (processed),
          INDEX idx_timestamp (change_timestamp)
        )
      `);
      
      StructuredLogger.logSystemEvent('CDC_TRACKING_TABLE_CREATED', 'info', {
        table: 'cdc_change_log'
      });
      
    } catch (error) {
      StructuredLogger.logSystemEvent('CDC_TRACKING_TABLE_ERROR', 'error', {
        error: error.message
      });
      throw error;
    }
  }

  async createCDCTriggers() {
    try {
      // Note: TiDB supports triggers, but with some limitations
      // We'll create triggers for the main tables we want to monitor
      
      const tables = [
        { name: 'users', idColumn: 'id' },
        { name: 'user_tokens', idColumn: 'id' },
        { name: 'user_activity_log', idColumn: 'id' }
      ];

      for (const table of tables) {
        await this.createTableTriggers(table.name, table.idColumn);
      }
      
      StructuredLogger.logSystemEvent('CDC_TRIGGERS_CREATED', 'info', {
        tables: tables.map(t => t.name)
      });
      
    } catch (error) {
      StructuredLogger.logSystemEvent('CDC_TRIGGERS_ERROR', 'error', {
        error: error.message
      });
      // Don't throw - we can still use polling-based CDC
      console.warn('CDC Triggers creation failed, falling back to polling-based CDC');
    }
  }

  async createTableTriggers(tableName, idColumn) {
    try {
      // Create INSERT trigger
      await this.db.execute(`
        CREATE TRIGGER IF NOT EXISTS ${tableName}_insert_trigger
        AFTER INSERT ON ${tableName}
        FOR EACH ROW
        INSERT INTO cdc_change_log (table_name, operation_type, record_id, new_data, user_id)
        VALUES ('${tableName}', 'INSERT', NEW.${idColumn}, JSON_OBJECT('id', NEW.${idColumn}), 
                CASE WHEN '${tableName}' = 'users' THEN NEW.${idColumn} 
                     WHEN '${tableName}' = 'user_tokens' THEN NEW.user_id 
                     ELSE NULL END)
      `);

      // Create UPDATE trigger
      await this.db.execute(`
        CREATE TRIGGER IF NOT EXISTS ${tableName}_update_trigger
        AFTER UPDATE ON ${tableName}
        FOR EACH ROW
        INSERT INTO cdc_change_log (table_name, operation_type, record_id, old_data, new_data, user_id)
        VALUES ('${tableName}', 'UPDATE', NEW.${idColumn}, 
                JSON_OBJECT('id', OLD.${idColumn}), 
                JSON_OBJECT('id', NEW.${idColumn}),
                CASE WHEN '${tableName}' = 'users' THEN NEW.${idColumn} 
                     WHEN '${tableName}' = 'user_tokens' THEN NEW.user_id 
                     ELSE NULL END)
      `);

      // Create DELETE trigger
      await this.db.execute(`
        CREATE TRIGGER IF NOT EXISTS ${tableName}_delete_trigger
        AFTER DELETE ON ${tableName}
        FOR EACH ROW
        INSERT INTO cdc_change_log (table_name, operation_type, record_id, old_data, user_id)
        VALUES ('${tableName}', 'DELETE', OLD.${idColumn}, 
                JSON_OBJECT('id', OLD.${idColumn}),
                CASE WHEN '${tableName}' = 'users' THEN OLD.${idColumn} 
                     WHEN '${tableName}' = 'user_tokens' THEN OLD.user_id 
                     ELSE NULL END)
      `);
      
    } catch (error) {
      console.warn(`Failed to create triggers for ${tableName}:`, error.message);
      // Continue with other tables
    }
  }

  async initializeLastProcessedIds() {
    try {
      const [rows] = await this.db.execute(
        'SELECT MAX(id) as maxId FROM cdc_change_log WHERE processed = true'
      );
      this.lastProcessedId.cdc_change_log = rows[0]?.maxId || 0;
      
      StructuredLogger.logSystemEvent('CDC_INITIALIZED', 'info', {
        lastProcessedId: this.lastProcessedId
      });
      
    } catch (error) {
      this.lastProcessedId.cdc_change_log = 0;
      console.warn('Failed to initialize last processed IDs:', error.message);
    }
  }

  startPolling() {
    if (!this.isRunning) return;
    
    setTimeout(async () => {
      try {
        await this.pollForChanges();
      } catch (error) {
        StructuredLogger.logSystemEvent('CDC_POLLING_ERROR', 'error', {
          error: error.message
        });
      }
      
      // Continue polling
      this.startPolling();
    }, this.pollingInterval);
  }

  async pollForChanges() {
    try {
      // Get unprocessed changes from CDC log
      const [changes] = await this.db.execute(`
        SELECT * FROM cdc_change_log 
        WHERE id > ? AND processed = FALSE 
        ORDER BY id ASC 
        LIMIT 100
      `, [this.lastProcessedId.cdc_change_log || 0]);

      if (changes.length === 0) {
        return; // No new changes
      }

      console.log(`📊 Processing ${changes.length} database changes`);

      for (const change of changes) {
        await this.processChange(change);
        this.changesProcessed++;
        this.lastProcessedId.cdc_change_log = change.id;
      }

      // Mark changes as processed
      if (changes.length > 0) {
        const maxId = Math.max(...changes.map(c => c.id));
        await this.db.execute(
          'UPDATE cdc_change_log SET processed = TRUE WHERE id <= ?',
          [maxId]
        );
      }

    } catch (error) {
      StructuredLogger.logSystemEvent('CDC_POLL_ERROR', 'error', {
        error: error.message,
        lastProcessedId: this.lastProcessedId
      });
    }
  }

  async processChange(change) {
    try {
      // Create structured log entry for database change
      const changeLogEntry = {
        timestamp: new Date().toISOString(),
        category: 'DATABASE_CHANGE',
        operation: change.operation_type,
        table: change.table_name,
        recordId: change.record_id,
        userId: change.user_id,
        oldData: change.old_data,
        newData: change.new_data,
        changeTimestamp: change.change_timestamp,
        cdcMetadata: {
          cdcId: change.id,
          processedAt: new Date().toISOString(),
          processingDelay: Date.now() - new Date(change.change_timestamp).getTime()
        },
        metadata: {
          database: config.database.database,
          environment: process.env.NODE_ENV || 'development',
          cdcService: 'tidb-cdc'
        }
      };

      // Output structured log to console as required
      console.log(JSON.stringify(changeLogEntry));

      // Log using StructuredLogger
      StructuredLogger.logDatabaseChange(
        change.operation_type,
        change.table_name,
        change.record_id,
        change.old_data,
        change.new_data,
        change.user_id
      );

      // Send to Kafka for real-time processing
      await this.sendChangeToKafka(changeLogEntry);

      // Additional processing for critical changes
      if (this.isCriticalChange(change)) {
        await this.processCriticalChange(change, changeLogEntry);
      }

    } catch (error) {
      StructuredLogger.logSystemEvent('CDC_CHANGE_PROCESSING_ERROR', 'error', {
        changeId: change.id,
        error: error.message
      });
    }
  }

  async sendChangeToKafka(changeLogEntry) {
    try {
      await this.producer.send({
        topic: 'database-events',
        messages: [{
          key: `${changeLogEntry.table}_${changeLogEntry.recordId}`,
          value: JSON.stringify(changeLogEntry),
          timestamp: Date.now().toString()
        }]
      });

      StructuredLogger.logKafkaEvent(
        'CHANGE_SENT',
        'database-events',
        0,
        null,
        changeLogEntry.table,
        changeLogEntry
      );

    } catch (error) {
      StructuredLogger.logSystemEvent('CDC_KAFKA_SEND_ERROR', 'error', {
        error: error.message,
        change: changeLogEntry
      });
    }
  }

  isCriticalChange(change) {
    // Define what constitutes a critical change
    if (change.table_name === 'users' && change.operation_type === 'DELETE') {
      return true;
    }
    if (change.table_name === 'users' && change.operation_type === 'UPDATE') {
      // Check if password was changed
      const oldData = change.old_data;
      const newData = change.new_data;
      if (oldData?.password !== newData?.password) {
        return true;
      }
    }
    return false;
  }

  async processCriticalChange(change, changeLogEntry) {
    const criticalLogEntry = {
      ...changeLogEntry,
      category: 'CRITICAL_DATABASE_CHANGE',
      alertLevel: 'HIGH',
      requiresAttention: true,
      securityImplications: this.getSecurityImplications(change)
    };

    // Output critical change log
    console.log(JSON.stringify(criticalLogEntry));

    // Send to high-priority Kafka topic
    await this.producer.send({
      topic: 'critical-database-events',
      messages: [{
        key: `CRITICAL_${change.table_name}_${change.record_id}`,
        value: JSON.stringify(criticalLogEntry),
        timestamp: Date.now().toString()
      }]
    });
  }

  getSecurityImplications(change) {
    if (change.table_name === 'users' && change.operation_type === 'DELETE') {
      return 'USER_ACCOUNT_DELETED';
    }
    if (change.table_name === 'users' && change.operation_type === 'UPDATE') {
      return 'USER_DATA_MODIFIED';
    }
    return 'UNKNOWN';
  }

  async stop() {
    if (this.isRunning) {
      this.isRunning = false;
      
      if (this.producer) {
        await this.producer.disconnect();
      }
      
      if (this.db) {
        await this.db.end();
      }
      
      StructuredLogger.logSystemEvent('CDC_SERVICE_STOPPED', 'info', {
        changesProcessed: this.changesProcessed,
        uptime: Date.now() - this.startTime
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      changesProcessed: this.changesProcessed,
      uptime: Date.now() - this.startTime,
      lastProcessedId: this.lastProcessedId,
      pollingInterval: this.pollingInterval
    };
  }
}

// Start the CDC service if this file is run directly
if (require.main === module) {
  const cdcService = new TiDBCDCService();
  
  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down CDC service...');
    await cdcService.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down CDC service...');
    await cdcService.stop();
    process.exit(0);
  });

  // Start the CDC service
  cdcService.start().catch(error => {
    console.error('Failed to start TiDB CDC service:', error);
    process.exit(1);
  });
}

module.exports = TiDBCDCService;