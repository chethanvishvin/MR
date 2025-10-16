import { AppState } from "react-native"
import NetInfo from "@react-native-community/netinfo"
import { uploadPendingData, createServerInstance } from "./apiService"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { checkInternetConnection } from "./networkUtils"
import { syncMeterSerialNumbers } from "./syncService"
import { 
  getPendingOldMeterData, 
  getPendingNewMeterData, 
  markOldMeterDataAsUploaded, 
  markNewMeterDataAsUploaded, 
  markMeterDataWithError 
} from "./databaseUtils"
import BackgroundTimer from 'react-native-background-timer'

let appStateListener = null
let netInfoListener = null
let dataUploadInterval = null
let meterSyncInterval = null
let backgroundSyncInterval = null
let isCurrentlyUploading = false
let isCurrentlyMeterSyncing = false
let isBackgroundSyncing = false
let lastUploadAttempt = 0
let lastMeterSyncAttempt = 0
let lastBackgroundSyncAttempt = 0
let isInitialized = false

// Exact intervals as requested
const DATA_UPLOAD_INTERVAL = 3 * 60 * 1000 // Exactly 3 minutes (180000ms)
const METER_SYNC_INTERVAL = 5 * 1000 // Exactly 5 seconds (5000ms)
const BACKGROUND_SYNC_INTERVAL = 2 * 60 * 1000 // 2 minutes for background sync

// Cooldown periods to prevent too frequent attempts
const UPLOAD_COOLDOWN = 5 * 1000 // 5 seconds cooldown for data upload
const METER_SYNC_COOLDOWN = 500 // 0.5 second cooldown for meter sync
const BACKGROUND_SYNC_COOLDOWN = 10 * 1000 // 10 seconds cooldown for background sync

console.log(`🚀 Background Service Configuration:`)
console.log(`- Data Upload Interval: ${DATA_UPLOAD_INTERVAL / 1000} seconds (${DATA_UPLOAD_INTERVAL / 60000} minutes)`)
console.log(`- Meter Sync Interval: ${METER_SYNC_INTERVAL / 1000} seconds`)
console.log(`- Background Sync Interval: ${BACKGROUND_SYNC_INTERVAL / 1000} seconds (${BACKGROUND_SYNC_INTERVAL / 60000} minutes)`)

// Safe async function wrapper
const safeAsync = async (fn, context = "unknown") => {
  try {
    return await fn()
  } catch (error) {
    console.error(`❌ Error in ${context}:`, error)
    return null
  }
}

// Helper function to add delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Background sync function that handles complete sync process
const performBackgroundSync = async () => {
  try {
    // Check if user is logged in
    const token = await AsyncStorage.getItem("userToken")
    if (!token) {
      console.log("🔐 No user token, skipping background sync")
      return { success: false, reason: "not_logged_in" }
    }

    // Prevent multiple simultaneous background syncs
    if (isBackgroundSyncing) {
      console.log("🔄 Background sync already in progress, skipping")
      return { success: false, reason: "already_syncing" }
    }

    // Check cooldown period
    const now = Date.now()
    if (now - lastBackgroundSyncAttempt < BACKGROUND_SYNC_COOLDOWN) {
      return { success: false, reason: "cooldown" }
    }

    lastBackgroundSyncAttempt = now
    isBackgroundSyncing = true

    try {
      // Check network connectivity
      const isConnected = await checkInternetConnection()
      if (!isConnected) {
        console.log("🌐 No internet connection for background sync")
        return { success: false, reason: "no_internet" }
      }

      const userId = await AsyncStorage.getItem("userId")
      console.log("🔄 Starting background sync process... User ID:", userId || "Not available")

      // Get all pending data
      const pendingOldMeterData = await getPendingOldMeterData()
      const pendingNewMeterData = await getPendingNewMeterData()

      console.log(`📊 Background sync found ${pendingOldMeterData.length} old meter and ${pendingNewMeterData.length} new meter records`)

      // If no pending data, return early
      if (pendingOldMeterData.length === 0 && pendingNewMeterData.length === 0) {
        console.log("✅ No pending data for background sync")
        return { success: true, reason: "no_data", uploaded: 0 }
      }

      let totalUploaded = 0
      let totalFailed = 0

      // Group data by account_id
      const accountGroups = new Map()

      // Group old meter data by account_id
      pendingOldMeterData.forEach((data) => {
        // Ensure user ID is set
        if (userId && (!data.created_by || data.created_by === "0")) {
          data.created_by = userId
        }

        // Make sure meter_make_old is set
        if (!data.meter_make_old && data.meter_make) {
          data.meter_make_old = data.meter_make
        }

        // Ensure created_at is set
        if (!data.created_at) {
          data.created_at = data.timestamp || new Date().toISOString()
        }

        // Ensure meter category is properly set
        if (data.meterCategory && !data.meter_category && !data.category) {
          if (data.meterCategory === "Electromechanical") {
            data.category = "EM"
          } else if (["MNR", "DC", "RNV"].includes(data.meterCategory)) {
            data.category = data.meterCategory
          }
        }

        if (!accountGroups.has(data.account_id)) {
          accountGroups.set(data.account_id, { oldMeter: [], newMeter: [] })
        }
        accountGroups.get(data.account_id).oldMeter.push(data)
      })

      // Group new meter data by account_id
      pendingNewMeterData.forEach((data) => {
        // Ensure user ID is set
        if (userId && (!data.created_by || data.created_by === "0")) {
          data.created_by = userId
        }

        // Ensure initial_reading fields are set with valid values
        const initialReading = String(data.initial_reading || data.initial_reading_kwh || "0").trim()
        data.initial_reading = initialReading
        data.initial_reading_kwh = initialReading
        data.initial_reading_kvah = initialReading

        // Ensure created_at is set
        if (!data.created_at) {
          data.created_at = data.timestamp || new Date().toISOString()
        }

        if (!accountGroups.has(data.account_id)) {
          accountGroups.set(data.account_id, { oldMeter: [], newMeter: [] })
        }
        accountGroups.get(data.account_id).newMeter.push(data)
      })

      console.log(`🔄 Background sync processing ${accountGroups.size} account groups`)

      // Process each account group (limit to 3 accounts per background sync to avoid overwhelming)
      let processedAccounts = 0
      const maxAccountsPerSync = 3

      for (const [accountId, group] of accountGroups) {
        if (processedAccounts >= maxAccountsPerSync) {
          console.log(`⏸️ Background sync reached limit of ${maxAccountsPerSync} accounts, will continue in next cycle`)
          break
        }

        console.log(`🏢 Background sync processing account ID: ${accountId}`)
        console.log(`📊 Old meter records: ${group.oldMeter.length}, New meter records: ${group.newMeter.length}`)

        // Validate account ID
        if (!accountId || accountId.toString().trim() === "") {
          console.error(`❌ Invalid account ID: ${accountId}`)
          totalFailed += group.oldMeter.length + group.newMeter.length
          continue
        }

        try {
          // STEP 1: Create server instance
          console.log(`🔧 Creating server instance for account ID: ${accountId}`)
          const instanceResult = await createServerInstance(accountId)

          if (!instanceResult.success) {
            console.error(`❌ Failed to create server instance for account ${accountId}:`, instanceResult.error)
            
            // Mark all records for this account as failed
            for (const data of group.oldMeter) {
              await markMeterDataWithError(data.id, `Server instance failed: ${instanceResult.error}`, "old")
              totalFailed++
            }
            for (const data of group.newMeter) {
              await markMeterDataWithError(data.id, `Server instance failed: ${instanceResult.error}`, "new")
              totalFailed++
            }
            continue
          }

          console.log(`✅ Server instance created for account ${accountId}`)

          // STEP 2: Upload old meter data
          for (const oldMeterData of group.oldMeter) {
            try {
              if (!oldMeterData.account_id) {
                oldMeterData.account_id = accountId
              }

              console.log(`📤 Background uploading old meter record ID: ${oldMeterData.id}`)
              
              // Import the upload function dynamically to avoid circular dependencies
              const { uploadOldMeterData } = require("./apiService")
              const result = await uploadOldMeterData(oldMeterData)

              if (result.success) {
                console.log(`✅ Background uploaded old meter record ID: ${oldMeterData.id}`)
                await markOldMeterDataAsUploaded(oldMeterData.id)
                totalUploaded++
              } else {
                console.error(`❌ Background failed to upload old meter record ID: ${oldMeterData.id}`, result.error)
                await markMeterDataWithError(oldMeterData.id, result.error, "old")
                totalFailed++
              }
            } catch (error) {
              console.error(`❌ Background exception uploading old meter record ID: ${oldMeterData.id}`, error)
              await markMeterDataWithError(oldMeterData.id, error.message || "Unknown error", "old")
              totalFailed++
            }

            // Small delay between uploads to prevent overwhelming the server
            await delay(1000)
          }

          // STEP 3: Upload new meter data
          for (const newMeterData of group.newMeter) {
            try {
              if (!newMeterData.account_id) {
                newMeterData.account_id = accountId
              }

              // Ensure initial_reading fields are set
              const initialReading = String(newMeterData.initial_reading || newMeterData.initial_reading_kwh || "0").trim()
              newMeterData.initial_reading = initialReading
              newMeterData.initial_reading_kwh = initialReading
              newMeterData.initial_reading_kvah = initialReading

              // Remove seal_number if present
              if (newMeterData.seal_number) {
                delete newMeterData.seal_number
              }

              console.log(`📤 Background uploading new meter record ID: ${newMeterData.id}`)
              
              // Import the upload function dynamically to avoid circular dependencies
              const { uploadNewMeterData } = require("./apiService")
              const result = await uploadNewMeterData(newMeterData)

              if (result.success) {
                console.log(`✅ Background uploaded new meter record ID: ${newMeterData.id}`)
                await markNewMeterDataAsUploaded(newMeterData.id)
                totalUploaded++
              } else {
                console.error(`❌ Background failed to upload new meter record ID: ${newMeterData.id}`, result.error)
                
                // Handle duplicate errors
                if (
                  result.isDuplicateError ||
                  (result.data && result.data.message && 
                   (result.data.message.toLowerCase().includes("already exists") ||
                    result.data.message.toLowerCase().includes("already been taken"))) ||
                  (result.error && 
                   (result.error.toLowerCase().includes("already exists") ||
                    result.error.toLowerCase().includes("already been taken")))
                ) {
                  await markMeterDataWithError(newMeterData.id, `Duplicate serial number: ${newMeterData.serial_no_new}`, "new")
                } else {
                  await markMeterDataWithError(newMeterData.id, result.error, "new")
                }
                totalFailed++
              }
            } catch (error) {
              console.error(`❌ Background exception uploading new meter record ID: ${newMeterData.id}`, error)
              await markMeterDataWithError(newMeterData.id, error.message || "Unknown error", "new")
              totalFailed++
            }

            // Small delay between uploads to prevent overwhelming the server
            await delay(1000)
          }

          processedAccounts++
          
          // Delay between accounts to prevent overwhelming the server
          if (processedAccounts < Math.min(maxAccountsPerSync, accountGroups.size)) {
            await delay(2000)
          }

        } catch (error) {
          console.error(`❌ Background sync error for account ${accountId}:`, error)
          
          // Mark all records for this account as failed
          for (const data of group.oldMeter) {
            await markMeterDataWithError(data.id, error.message || "Unknown error", "old")
            totalFailed++
          }
          for (const data of group.newMeter) {
            await markMeterDataWithError(data.id, error.message || "Unknown error", "new")
            totalFailed++
          }
        }
      }

      console.log(`🎉 Background sync completed: ${totalUploaded} uploaded, ${totalFailed} failed`)

      return {
        success: totalUploaded > 0,
        uploaded: totalUploaded,
        failed: totalFailed,
        processedAccounts: processedAccounts,
        totalAccounts: accountGroups.size
      }

    } catch (error) {
      console.error("❌ Error during background sync:", error)
      return { success: false, error: error.message, uploaded: 0, failed: 0 }
    } finally {
      isBackgroundSyncing = false
    }
  } catch (error) {
    console.error("❌ Error in performBackgroundSync:", error)
    isBackgroundSyncing = false
    return { success: false, error: error.message }
  }
}

// Set up app state change listener
export const setupAppStateListener = () => {
  console.log("Setting up AppState change listener...")

  try {
    if (appStateListener) {
      appStateListener.remove()
    }

    appStateListener = AppState.addEventListener("change", (nextAppState) => {
      console.log(`AppState changed to: ${nextAppState}`)
      if (nextAppState === "active") {
        console.log("App came to foreground, triggering immediate sync checks...")

        // Use setTimeout to prevent blocking the main thread
        setTimeout(() => {
          safeAsync(() => checkConnectionAndUpload(), "foreground data upload")
        }, 2000)

        setTimeout(() => {
          safeAsync(() => checkConnectionAndSyncMeters(), "foreground meter sync")
        }, 1000)
      } else if (nextAppState === "background") {
        console.log("App went to background, background sync will continue...")
        // Background sync will continue running via the interval
      }
    })

    console.log("✅ AppState listener set up successfully")
  } catch (error) {
    console.error("❌ Error setting up AppState listener:", error)
  }

  return () => {
    if (appStateListener) {
      try {
        appStateListener.remove()
        appStateListener = null
        console.log("🧹 AppState listener removed")
      } catch (error) {
        console.error("❌ Error removing AppState listener:", error)
      }
    }
  }
}

// Check connection and upload data if connected (runs every 3 minutes)
const checkConnectionAndUpload = async () => {
  try {
    // Check if user is logged in
    const token = await AsyncStorage.getItem("userToken")
    if (!token) {
      return // Silent skip when not logged in
    }

    // Prevent multiple simultaneous uploads
    if (isCurrentlyUploading) {
      return // Silent skip
    }

    // Check cooldown period
    const now = Date.now()
    if (now - lastUploadAttempt < UPLOAD_COOLDOWN) {
      return // Silent skip
    }

    lastUploadAttempt = now
    isCurrentlyUploading = true

    try {
      // Check network connectivity
      const isConnected = await checkInternetConnection()
      if (!isConnected) {
        return // Silent skip when offline
      }

      const userId = await AsyncStorage.getItem("userId")
      console.log("📤 Starting data upload process... User ID:", userId || "Not available")

      const result = await uploadPendingData()

      if (result && result.success) {
        const totalUploaded = (result.oldMeterUploaded || 0) + (result.newMeterUploaded || 0)
        if (totalUploaded > 0) {
          console.log(
            `✅ Data upload successful: ${totalUploaded} records uploaded (${result.oldMeterUploaded || 0} old meter, ${result.newMeterUploaded || 0} new meter)`,
          )
        }
      } else if (result && !result.success) {
        console.error("❌ Data upload failed:", result.error || "Unknown error")
      }
    } catch (error) {
      console.error("❌ Error during data upload process:", error)
    } finally {
      isCurrentlyUploading = false
    }
  } catch (error) {
    console.error("❌ Error in checkConnectionAndUpload:", error)
    isCurrentlyUploading = false
  }
}

// Check connection and sync meter serial numbers if connected (runs every 5 seconds)
const checkConnectionAndSyncMeters = async () => {
  try {
    const token = await AsyncStorage.getItem("userToken")
    if (!token) {
      return // Silent skip when not logged in
    }

    // Prevent multiple simultaneous meter syncs
    if (isCurrentlyMeterSyncing) {
      return // Silent skip
    }

    // Check cooldown period
    const now = Date.now()
    if (now - lastMeterSyncAttempt < METER_SYNC_COOLDOWN) {
      return // Silent skip
    }

    lastMeterSyncAttempt = now
    isCurrentlyMeterSyncing = true

    try {
      // Check network connectivity
      const isConnected = await checkInternetConnection()
      if (!isConnected) {
        return // Silent skip when offline
      }

      const result = await syncMeterSerialNumbers(false, false) // Silent sync

      if (result && result.success && !result.skipped && result.saved > 0) {
        console.log(`🔄 Meter sync successful: ${result.saved} serial numbers synced`)
      }
    } catch (error) {
      console.error("❌ Error during meter sync process:", error)
    } finally {
      isCurrentlyMeterSyncing = false
    }
  } catch (error) {
    console.error("❌ Error in checkConnectionAndSyncMeters:", error)
    isCurrentlyMeterSyncing = false
  }
}

// Background sync check (runs every 2 minutes)
const checkBackgroundSync = async () => {
  try {
    const currentState = AppState.currentState
    console.log(`🔄 Background sync check (AppState: ${currentState})`)

    // Run background sync regardless of app state (foreground or background)
    const result = await performBackgroundSync()
    
    if (result && result.success && result.uploaded > 0) {
      console.log(`✅ Background sync completed: ${result.uploaded} records uploaded`)
    } else if (result && result.reason) {
      // Only log non-routine reasons
      if (!["no_data", "cooldown", "already_syncing"].includes(result.reason)) {
        console.log(`ℹ️ Background sync skipped: ${result.reason}`)
      }
    }
  } catch (error) {
    console.error("❌ Error in background sync check:", error)
  }
}

// Set up network change listener
export const setupNetworkListener = () => {
  console.log("Setting up network change listener...")

  try {
    if (netInfoListener) {
      netInfoListener()
    }

    netInfoListener = NetInfo.addEventListener((state) => {
      console.log(`🌐 Network state changed: ${state.type} (Connected: ${state.isConnected})`)

      if (state.isConnected && state.isInternetReachable) {
        console.log("🌐 Internet connection detected, triggering immediate sync...")

        // Verify actual connectivity before attempting sync
        safeAsync(async () => {
          const isReallyConnected = await checkInternetConnection()
          if (isReallyConnected) {
            console.log("✅ Real connectivity confirmed, starting sync processes...")

            // Stagger the calls to avoid conflicts
            setTimeout(() => {
              safeAsync(() => checkConnectionAndUpload(), "network change data upload")
            }, 3000)

            setTimeout(() => {
              safeAsync(() => checkConnectionAndSyncMeters(), "network change meter sync")
            }, 1000)

            // Also trigger background sync
            setTimeout(() => {
              safeAsync(() => performBackgroundSync(), "network change background sync")
            }, 5000)
          }
        }, "network change handler")
      }
    })

    console.log("✅ Network change listener set up successfully")
  } catch (error) {
    console.error("❌ Error setting up network listener:", error)
  }

  return () => {
    if (netInfoListener) {
      try {
        netInfoListener()
        netInfoListener = null
        console.log("🧹 Network listener removed")
      } catch (error) {
        console.error("❌ Error removing network listener:", error)
      }
    }
  }
}

// Start periodic data upload (every 3 minutes)
export const startPeriodicDataUpload = () => {
  console.log(`🚀 Starting periodic data upload every ${DATA_UPLOAD_INTERVAL / 60000} minutes...`)
  stopPeriodicDataUpload()

  try {
    // Start the interval using BackgroundTimer
    dataUploadInterval = BackgroundTimer.setInterval(() => {
      try {
        const currentState = AppState.currentState
        console.log(`⏰ Periodic data upload check (AppState: ${currentState})`)

        if (currentState === "active") {
          safeAsync(() => checkConnectionAndUpload(), "periodic data upload")
        }
      } catch (error) {
        console.error("❌ Error in periodic data upload check:", error)
      }
    }, DATA_UPLOAD_INTERVAL)

    // Perform initial upload after a short delay
    BackgroundTimer.setTimeout(() => {
      console.log("🔄 Performing initial data upload...")
      safeAsync(() => checkConnectionAndUpload(), "initial data upload")
    }, 15000) // 15 seconds after start

    console.log(`✅ Periodic data upload started (every ${DATA_UPLOAD_INTERVAL / 60000} minutes)`)
  } catch (error) {
    console.error("❌ Error starting periodic data upload:", error)
  }

  return () => {
    stopPeriodicDataUpload()
  }
}

// Start periodic meter sync (every 5 seconds)
export const startPeriodicMeterSync = () => {
  console.log(`🚀 Starting periodic meter sync every ${METER_SYNC_INTERVAL / 1000} seconds...`)
  stopPeriodicMeterSync()

  try {
    // Start the interval using BackgroundTimer
    meterSyncInterval = BackgroundTimer.setInterval(() => {
      try {
        const currentState = AppState.currentState

        if (currentState === "active") {
          safeAsync(() => checkConnectionAndSyncMeters(), "periodic meter sync")
        }
      } catch (error) {
        console.error("❌ Error in periodic meter sync check:", error)
      }
    }, METER_SYNC_INTERVAL)

    // Perform initial meter sync after a short delay
    BackgroundTimer.setTimeout(() => {
      console.log("🔄 Performing initial meter sync...")
      safeAsync(() => checkConnectionAndSyncMeters(), "initial meter sync")
    }, 8000) // 8 seconds after start

    console.log(`✅ Periodic meter sync started (every ${METER_SYNC_INTERVAL / 1000} seconds)`)
  } catch (error) {
    console.error("❌ Error starting periodic meter sync:", error)
  }

  return () => {
    stopPeriodicMeterSync()
  }
}

// Start background sync (every 2 minutes) - works in foreground and background
export const startBackgroundSync = () => {
  console.log(`🚀 Starting background sync every ${BACKGROUND_SYNC_INTERVAL / 60000} minutes...`)
  stopBackgroundSync()

  try {
    // Start the interval using BackgroundTimer
    backgroundSyncInterval = BackgroundTimer.setInterval(() => {
      try {
        safeAsync(() => checkBackgroundSync(), "background sync")
      } catch (error) {
        console.error("❌ Error in background sync check:", error)
      }
    }, BACKGROUND_SYNC_INTERVAL)

    // Perform initial background sync after a short delay
    BackgroundTimer.setTimeout(() => {
      console.log("🔄 Performing initial background sync...")
      safeAsync(() => performBackgroundSync(), "initial background sync")
    }, 20000) // 20 seconds after start

    console.log(`✅ Background sync started (every ${BACKGROUND_SYNC_INTERVAL / 60000} minutes)`)
  } catch (error) {
    console.error("❌ Error starting background sync:", error)
  }

  return () => {
    stopBackgroundSync()
  }
}

// Stop periodic data upload
export const stopPeriodicDataUpload = () => {
  if (dataUploadInterval) {
    try {
      BackgroundTimer.clearInterval(dataUploadInterval)
      dataUploadInterval = null
      console.log("🛑 Stopped periodic data upload")
    } catch (error) {
      console.error("❌ Error stopping periodic data upload:", error)
    }
  }
}

// Stop periodic meter sync
export const stopPeriodicMeterSync = () => {
  if (meterSyncInterval) {
    try {
      BackgroundTimer.clearInterval(meterSyncInterval)
      meterSyncInterval = null
      console.log("🛑 Stopped periodic meter sync")
    } catch (error) {
      console.error("❌ Error stopping periodic meter sync:", error)
    }
  }
}

// Stop background sync
export const stopBackgroundSync = () => {
  if (backgroundSyncInterval) {
    try {
      BackgroundTimer.clearInterval(backgroundSyncInterval)
      backgroundSyncInterval = null
      console.log("🛑 Stopped background sync")
    } catch (error) {
      console.error("❌ Error stopping background sync:", error)
    }
  }
}

// Stop all periodic checks
export const stopPeriodicCheck = () => {
  stopPeriodicDataUpload()
  stopPeriodicMeterSync()
  stopBackgroundSync()
}

// Initialize all background services
export const initializeBackgroundServices = () => {
  if (isInitialized) {
    console.log("⚠️ Background services already initialized, skipping...")
    return () => {}
  }

  console.log("🚀 Initializing all background services...")
  console.log(`📊 Configuration:`)
  console.log(`   - Data Upload: every ${DATA_UPLOAD_INTERVAL / 60000} minutes`)
  console.log(`   - Meter Sync: every ${METER_SYNC_INTERVAL / 1000} seconds`)
  console.log(`   - Background Sync: every ${BACKGROUND_SYNC_INTERVAL / 60000} minutes`)

  try {
    isInitialized = true

    // Start background timer
    BackgroundTimer.start()

    const appStateCleanup = setupAppStateListener()
    const networkCleanup = setupNetworkListener()
    const dataUploadCleanup = startPeriodicDataUpload()
    const meterSyncCleanup = startPeriodicMeterSync()
    const backgroundSyncCleanup = startBackgroundSync()

    console.log("✅ All background services initialized successfully")

    // Return a cleanup function
    return () => {
      console.log("🧹 Cleaning up all background services...")

      try {
        isInitialized = false

        // Stop background timer
        BackgroundTimer.stop()

        if (appStateCleanup) appStateCleanup()
        if (networkCleanup) networkCleanup()
        if (dataUploadCleanup) dataUploadCleanup()
        else stopPeriodicDataUpload()
        if (meterSyncCleanup) meterSyncCleanup()
        else stopPeriodicMeterSync()
        if (backgroundSyncCleanup) backgroundSyncCleanup()
        else stopBackgroundSync()
      } catch (error) {
        console.error("❌ Error during background services cleanup:", error)
      }

      console.log("✅ All background services cleaned up")
    }
  } catch (error) {
    console.error("❌ Error initializing background services:", error)
    isInitialized = false
    return () => {}
  }
}

// Get current status of background services
export const getBackgroundServiceStatus = () => {
  return {
    isInitialized,
    dataUploadActive: !!dataUploadInterval,
    meterSyncActive: !!meterSyncInterval,
    backgroundSyncActive: !!backgroundSyncInterval,
    dataUploadInterval: DATA_UPLOAD_INTERVAL,
    meterSyncInterval: METER_SYNC_INTERVAL,
    backgroundSyncInterval: BACKGROUND_SYNC_INTERVAL,
    isCurrentlyUploading,
    isCurrentlyMeterSyncing,
    isBackgroundSyncing,
    lastUploadAttempt: lastUploadAttempt ? new Date(lastUploadAttempt) : null,
    lastMeterSyncAttempt: lastMeterSyncAttempt ? new Date(lastMeterSyncAttempt) : null,
    lastBackgroundSyncAttempt: lastBackgroundSyncAttempt ? new Date(lastBackgroundSyncAttempt) : null,
  }
}

// Force immediate sync (for manual triggers)
export const forceImmediateSync = async () => {
  console.log("🔄 Force immediate sync triggered...")

  try {
    // Force meter sync first
    console.log("🔄 Forcing meter sync...")
    const meterResult = await syncMeterSerialNumbers(true, false) // Force sync, no notifications
    console.log("🔄 Meter sync result:", meterResult)

    // Then force data upload
    console.log("📤 Forcing data upload...")
    setTimeout(async () => {
      await checkConnectionAndUpload()
    }, 2000) // 2 second delay

    // Also force background sync
    console.log("🔄 Forcing background sync...")
    setTimeout(async () => {
      await performBackgroundSync()
    }, 4000) // 4 second delay

    return { success: true, meterSync: meterResult }
  } catch (error) {
    console.error("❌ Error in force immediate sync:", error)
    return { success: false, error: error.message }
  }
}

// Force background sync (for manual triggers)
export const forceBackgroundSync = async () => {
  console.log("🔄 Force background sync triggered...")
  return await performBackgroundSync()
}

// Legacy function for backward compatibility
export const startPeriodicCheck = () => {
  return startPeriodicDataUpload()
}

export default {
  setupAppStateListener,
  setupNetworkListener,
  startPeriodicDataUpload,
  startPeriodicMeterSync,
  startBackgroundSync,
  stopPeriodicDataUpload,
  stopPeriodicMeterSync,
  stopBackgroundSync,
  stopPeriodicCheck,
  initializeBackgroundServices,
  getBackgroundServiceStatus,
  forceImmediateSync,
  forceBackgroundSync,
  performBackgroundSync,
  checkConnectionAndUpload,
  checkConnectionAndSyncMeters,
}