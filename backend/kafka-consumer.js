// Real-time Data Processing - Kafka Consumer
// Node.js consumer that reads DB change messages from Kafka

const { Kafka } = require('kafkajs');
const { StructuredLogger } = require('./logger');

// Use Docker config if NODE_ENV is 'docker', otherwise use local config
const config = process.env.NODE_ENV === 'docker' 
  ? require('./config-docker') 
  : require('./config');

class KafkaConsumerService {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'tidb-sre-consumer',
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });
    
    this.consumer = this.kafka.consumer({ 
      groupId: 'tidb-sre-data-processing-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });
    
    this.isRunning = false;
    this.processedMessages = 0;
    this.startTime = Date.now();
  }

  async start() {
    try {
      await this.consumer.connect();
      StructuredLogger.logSystemEvent('KAFKA_CONSUMER_CONNECTED', 'info', {
        brokers: config.kafka.brokers,
        groupId: 'tidb-sre-data-processing-group'
      });

      // Subscribe to all relevant topics
      await this.consumer.subscribe({ 
        topics: ['user-events', 'database-events', 'system-logs'],
        fromBeginning: false 
      });

      StructuredLogger.logSystemEvent('KAFKA_CONSUMER_SUBSCRIBED', 'info', {
        topics: ['user-events', 'database-events', 'system-logs']
      });

      this.isRunning = true;

      // Start consuming messages
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          await this.processMessage(topic, partition, message);
        },
        eachBatch: async ({ batch }) => {
          await this.processBatch(batch);
        }
      });

    } catch (error) {
      StructuredLogger.logSystemEvent('KAFKA_CONSUMER_ERROR', 'error', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async processMessage(topic, partition, message) {
    try {
      const startTime = Date.now();
      const key = message.key ? message.key.toString() : null;
      const value = message.value ? JSON.parse(message.value.toString()) : null;
      
      this.processedMessages++;

      // Log the Kafka event
      StructuredLogger.logKafkaEvent(
        'MESSAGE_RECEIVED',
        topic,
        partition,
        message.offset,
        key,
        value
      );

      // Process different types of messages
      switch (topic) {
        case 'user-events':
          await this.processUserEvent(value, message);
          break;
        case 'database-events':
          await this.processDatabaseEvent(value, message);
          break;
        case 'system-logs':
          await this.processSystemLog(value, message);
          break;
        default:
          StructuredLogger.logSystemEvent('UNKNOWN_TOPIC_MESSAGE', 'warn', {
            topic,
            partition,
            offset: message.offset
          });
      }

      // Log processing completion with structured format
      const processingTime = Date.now() - startTime;
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        category: 'REALTIME_DATA_PROCESSING',
        action: 'MESSAGE_PROCESSED',
        topic: topic,
        partition: partition,
        offset: message.offset,
        key: key,
        processingTime: processingTime,
        totalProcessed: this.processedMessages,
        uptime: Date.now() - this.startTime,
        metadata: {
          messageSize: message.value ? message.value.length : 0,
          keySize: message.key ? message.key.length : 0,
          timestamp: message.timestamp
        }
      }));

    } catch (error) {
      StructuredLogger.logSystemEvent('MESSAGE_PROCESSING_ERROR', 'error', {
        topic,
        partition,
        offset: message.offset,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async processUserEvent(eventData, message) {
    try {
      // Process user events with structured logging
      const logEntry = {
        timestamp: new Date().toISOString(),
        category: 'USER_EVENT_PROCESSING',
        eventType: eventData.type,
        userId: eventData.data?.userId,
        email: eventData.data?.email,
        action: eventData.data?.action || eventData.type,
        ipAddress: eventData.data?.ipAddress,
        userAgent: eventData.data?.userAgent,
        sessionId: eventData.data?.sessionId,
        kafkaMetadata: {
          topic: 'user-events',
          offset: message.offset,
          partition: message.partition
        },
        processingMetadata: {
          processedAt: new Date().toISOString(),
          processingNode: process.pid,
          environment: process.env.NODE_ENV || 'development'
        }
      };

      // Output structured log to console as required
      console.log(JSON.stringify(logEntry));

      // Additional processing based on event type
      switch (eventData.type) {
        case 'USER_LOGIN':
          this.processLoginEvent(eventData, logEntry);
          break;
        case 'USER_LOGOUT':
          this.processLogoutEvent(eventData, logEntry);
          break;
        case 'USER_REGISTERED':
          this.processRegistrationEvent(eventData, logEntry);
          break;
      }

    } catch (error) {
      StructuredLogger.logSystemEvent('USER_EVENT_PROCESSING_ERROR', 'error', {
        eventData,
        error: error.message
      });
    }
  }

  async processDatabaseEvent(eventData, message) {
    try {
      // Process database change events with structured logging
      const logEntry = {
        timestamp: new Date().toISOString(),
        category: 'DATABASE_CHANGE_PROCESSING',
        operation: eventData.operation,
        table: eventData.table,
        recordId: eventData.recordId,
        userId: eventData.userId,
        changeType: this.classifyChange(eventData),
        dataSize: {
          oldData: eventData.oldData ? JSON.stringify(eventData.oldData).length : 0,
          newData: eventData.newData ? JSON.stringify(eventData.newData).length : 0
        },
        kafkaMetadata: {
          topic: 'database-events',
          offset: message.offset,
          partition: message.partition
        },
        processingMetadata: {
          processedAt: new Date().toISOString(),
          processingNode: process.pid,
          environment: process.env.NODE_ENV || 'development'
        }
      };

      // Output structured log to console as required
      console.log(JSON.stringify(logEntry));

      // Process critical database changes
      if (this.isCriticalChange(eventData)) {
        this.processCriticalDatabaseChange(eventData, logEntry);
      }

    } catch (error) {
      StructuredLogger.logSystemEvent('DATABASE_EVENT_PROCESSING_ERROR', 'error', {
        eventData,
        error: error.message
      });
    }
  }

  async processSystemLog(eventData, message) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        category: 'SYSTEM_LOG_PROCESSING',
        level: eventData.level || 'info',
        event: eventData.event,
        data: eventData.data,
        kafkaMetadata: {
          topic: 'system-logs',
          offset: message.offset,
          partition: message.partition
        },
        processingMetadata: {
          processedAt: new Date().toISOString(),
          processingNode: process.pid
        }
      };

      console.log(JSON.stringify(logEntry));

    } catch (error) {
      StructuredLogger.logSystemEvent('SYSTEM_LOG_PROCESSING_ERROR', 'error', {
        eventData,
        error: error.message
      });
    }
  }

  async processBatch(batch) {
    const batchSize = batch.messages.length;
    const batchLogEntry = {
      timestamp: new Date().toISOString(),
      category: 'BATCH_PROCESSING',
      topic: batch.topic,
      partition: batch.partition,
      batchSize: batchSize,
      firstOffset: batch.messages[0]?.offset,
      lastOffset: batch.messages[batchSize - 1]?.offset,
      totalProcessed: this.processedMessages,
      metadata: {
        processingNode: process.pid,
        uptime: Date.now() - this.startTime
      }
    };

    console.log(JSON.stringify(batchLogEntry));
  }

  processLoginEvent(eventData, logEntry) {
    // Additional login event processing
    if (eventData.data?.ipAddress) {
      console.log(JSON.stringify({
        ...logEntry,
        category: 'SECURITY_MONITORING',
        securityEvent: 'USER_LOGIN_DETECTED',
        riskLevel: this.assessLoginRisk(eventData.data)
      }));
    }
  }

  processLogoutEvent(eventData, logEntry) {
    // Track session duration if available
    console.log(JSON.stringify({
      ...logEntry,
      category: 'SESSION_MONITORING',
      sessionEvent: 'USER_SESSION_ENDED'
    }));
  }

  processRegistrationEvent(eventData, logEntry) {
    // Track new user registrations
    console.log(JSON.stringify({
      ...logEntry,
      category: 'USER_GROWTH_MONITORING',
      growthEvent: 'NEW_USER_REGISTERED'
    }));
  }

  classifyChange(eventData) {
    if (eventData.table === 'users') return 'USER_DATA_CHANGE';
    if (eventData.table === 'user_tokens') return 'AUTH_TOKEN_CHANGE';
    return 'GENERAL_DATA_CHANGE';
  }

  isCriticalChange(eventData) {
    return eventData.table === 'users' && 
           (eventData.operation === 'DELETE' || 
            (eventData.operation === 'UPDATE' && eventData.newData?.password !== eventData.oldData?.password));
  }

  processCriticalDatabaseChange(eventData, logEntry) {
    console.log(JSON.stringify({
      ...logEntry,
      category: 'CRITICAL_DATABASE_CHANGE',
      alertLevel: 'HIGH',
      requiresAttention: true
    }));
  }

  assessLoginRisk(loginData) {
    // Simple risk assessment logic
    if (loginData.ipAddress === '127.0.0.1') return 'LOW';
    return 'MEDIUM';
  }

  async stop() {
    if (this.isRunning) {
      await this.consumer.disconnect();
      this.isRunning = false;
      
      StructuredLogger.logSystemEvent('KAFKA_CONSUMER_STOPPED', 'info', {
        totalProcessed: this.processedMessages,
        uptime: Date.now() - this.startTime
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      processedMessages: this.processedMessages,
      uptime: Date.now() - this.startTime,
      startTime: new Date(this.startTime).toISOString()
    };
  }
}

// Start the consumer if this file is run directly
if (require.main === module) {
  const consumer = new KafkaConsumerService();
  
  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down consumer...');
    await consumer.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down consumer...');
    await consumer.stop();
    process.exit(0);
  });

  // Start the consumer
  consumer.start().catch(error => {
    console.error('Failed to start Kafka consumer:', error);
    process.exit(1);
  });

  console.log('🔄 Real-time Data Processing Consumer started...');
  console.log('📊 Processing Kafka messages with structured logging');
}

module.exports = KafkaConsumerService;