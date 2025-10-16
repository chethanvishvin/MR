// API Configuration
export const API_BASE_URL = "https://gescom.vishvin.com/api"

// Sync Configuration - Independent intervals
export const METER_SYNC_INTERVAL = 5 * 1000 // 5 seconds for meter serial number sync
export const DATA_UPLOAD_INTERVAL = 3 * 60 * 1000 // 3 minutes for data upload

// Database Configuration
export const DATABASE_NAME = "MeterApp.db"
export const DATABASE_VERSION = 1

// Other Configuration
export const MAX_RETRY_ATTEMPTS = 3
export const NETWORK_TIMEOUT = 30000 // 30 seconds

console.log("📋 App Configuration:")
console.log(`   - Meter Sync Interval: ${METER_SYNC_INTERVAL / 1000} seconds`)
console.log(`   - Data Upload Interval: ${DATA_UPLOAD_INTERVAL / 60000} minutes`)
console.log(`   - API Base URL: ${API_BASE_URL}`)
