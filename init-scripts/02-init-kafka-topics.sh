#!/bin/bash
# Kafka Topics Initialization Script

echo "🚀 Initializing Kafka topics for TiDB SRE Assignment..."

# Wait for Kafka to be ready
echo "⏳ Waiting for Kafka to be ready..."
sleep 30

# Create user-events topic for authentication events
kafka-topics --create \
  --topic user-events \
  --bootstrap-server kafka:29092 \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000 \
  --if-not-exists

echo "✅ Created topic: user-events"

# Create system-logs topic for application logs
kafka-topics --create \
  --topic system-logs \
  --bootstrap-server kafka:29092 \
  --partitions 2 \
  --replication-factor 1 \
  --config retention.ms=259200000 \
  --if-not-exists

echo "✅ Created topic: system-logs"

# Create database-events topic for database operations
kafka-topics --create \
  --topic database-events \
  --bootstrap-server kafka:29092 \
  --partitions 2 \
  --replication-factor 1 \
  --config retention.ms=432000000 \
  --if-not-exists

echo "✅ Created topic: database-events"

# List all topics
echo "📋 Available Kafka topics:"
kafka-topics --list --bootstrap-server kafka:29092

echo "🎉 Kafka topics initialization completed!"