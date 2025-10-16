import AsyncStorage from "@react-native-async-storage/async-storage"
import NetInfo from "@react-native-community/netinfo"
import {
  initMeterDatabase,
  saveUnusedMeterSerialNumbers,
  removeUnusedMeterSerialNumbers,
  getAllUnusedMeterSerialNumbers,
  getMeterSyncStats,
} from "../database/meterDatabase"

// API endpoint for fetching unused meter serial numbers
const METER_API_URL = "https://gescom.vishvin.com/api/Contractort_meter_information"

// Sync interval in milliseconds (10 seconds)
const SYNC_INTERVAL = 10 * 1000

// Maximum number of retries for failed syncs
const MAX_RETRIES = 3

// Flag to prevent multiple syncs from running simultaneously
let isSyncing = false
let syncInterval = null
let retryCount = 0
let lastError = null

// Initialize the meter database
export const initMeterSync = async () => {
  try {
    await initMeterDatabase()
    return true
  } catch (error) {
    console.error("Error initializing meter sync:", error)
    return false
  }
}

// Fetch unused meter serial numbers from the API
export const fetchUnusedMeterSerialNumbers = async () => {
  try {
    // Get auth token
    const token = await AsyncStorage.getItem("userToken")
    if (!token) {
      throw new Error("Authentication token not available")
    }

    // Make the API request
    const response = await fetch(METER_API_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`)
    }

    const data = await response.json()

    // Check if the response is valid
    if (!data || data.status !== "success" || !data.user_information) {
      throw new Error("Invalid API response format")
    }

    console.log(`Fetched data for ${data.user_information.length} contractors`)

    // Return the user_information array which contains the meter data
    return data.user_information
  } catch (error) {
    console.error("Error fetching unused meter serial numbers:", error)
    lastError = error.message || "Unknown error"
    throw error
  }
}

// Determine which serial numbers are new or removed since the last sync
export const calculateDeltaChanges = async (newData) => {
  try {
    // Get all current serial numbers from the database
    const currentSerialNumbers = await getAllUnusedMeterSerialNumbers()
    const currentSet = new Set(currentSerialNumbers)

    // Extract all serial numbers from the new data
    const newSerialNumbers = new Set()

    for (const contractor of newData) {
      if (!contractor.unused_meter_serial_no) continue

      const serialNumbers = contractor.unused_meter_serial_no
        .split(",")
        .map((num) => num.trim())
        .filter((num) => num !== "")

      for (const serialNumber of serialNumbers) {
        newSerialNumbers.add(serialNumber)
      }
    }

    // Find added and removed serial numbers
    const added = [...newSerialNumbers].filter((num) => !currentSet.has(num))
    const removed = [...currentSet].filter((num) => !newSerialNumbers.has(num))

    return { added, removed }
  } catch (error) {
    console.error("Error calculating delta changes:", error)
    throw error
  }
}

// Sync unused meter serial numbers
export const syncUnusedMeterSerialNumbers = async (forceFullSync = false) => {
  // Prevent multiple syncs from running simultaneously
  if (isSyncing) {
    console.log("Sync already in progress, skipping")
    return { success: false, message: "Sync already in progress" }
  }

  isSyncing = true

  try {
    // Check network connectivity
    const netInfo = await NetInfo.fetch()
    if (!netInfo.isConnected) {
      console.log("No internet connection, skipping sync")
      isSyncing = false
      return { success: false, message: "No internet connection" }
    }

    console.log("Starting meter sync...")

    // Fetch data from the API
    const meterData = await fetchUnusedMeterSerialNumbers()

    if (forceFullSync) {
      // For a full sync, replace all data
      await saveUnusedMeterSerialNumbers(meterData, true)

      console.log("Full sync completed successfully")
      retryCount = 0
      lastError = null

      isSyncing = false
      return {
        success: true,
        message: "Full sync completed successfully",
        added: meterData.reduce((count, contractor) => {
          if (!contractor.unused_meter_serial_no) return count
          return count + contractor.unused_meter_serial_no.split(",").filter((num) => num.trim() !== "").length
        }, 0),
        removed: 0,
        isFullSync: true,
      }
    } else {
      // For a delta sync, calculate changes
      const { added, removed } = await calculateDeltaChanges(meterData)

      // Apply changes
      if (added.length > 0 || removed.length > 0) {
        if (added.length > 0) {
          // Create a simplified data structure for the added serial numbers
          const addedData = meterData.filter(
            (contractor) =>
              contractor.unused_meter_serial_no &&
              contractor.unused_meter_serial_no.split(",").some((num) => added.includes(num.trim())),
          )

          await saveUnusedMeterSerialNumbers(addedData, false)
        }

        if (removed.length > 0) {
          await removeUnusedMeterSerialNumbers(removed)
        }

        console.log(`Delta sync completed: Added ${added.length}, Removed ${removed.length}`)
      } else {
        console.log("No changes detected in delta sync")
      }

      retryCount = 0
      lastError = null

      isSyncing = false
      return {
        success: true,
        message: "Delta sync completed successfully",
        added: added.length,
        removed: removed.length,
        isFullSync: false,
      }
    }
  } catch (error) {
    console.error("Error syncing unused meter serial numbers:", error)

    // Increment retry count
    retryCount++
    lastError = error.message || "Unknown error"

    isSyncing = false
    return {
      success: false,
      error: error.message || "Unknown error during sync",
      retryCount,
    }
  }
}

// Start periodic sync
export const startMeterSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval)
  }

  // Perform an initial sync
  syncUnusedMeterSerialNumbers()
    .then((result) => {
      console.log("Initial meter sync result:", result)
    })
    .catch((error) => {
      console.error("Error during initial meter sync:", error)
    })

  // Set up periodic sync
  syncInterval = setInterval(() => {
    // If we've had too many consecutive failures, try a full sync
    const shouldForceFullSync = retryCount >= MAX_RETRIES

    syncUnusedMeterSerialNumbers(shouldForceFullSync)
      .then((result) => {
        if (result.success) {
          console.log("Periodic meter sync successful:", result)
        } else {
          console.warn("Periodic meter sync failed:", result)
        }
      })
      .catch((error) => {
        console.error("Error during periodic meter sync:", error)
      })
  }, SYNC_INTERVAL)

  console.log(`Started periodic meter sync every ${SYNC_INTERVAL / 1000} seconds`)

  // Set up network change listener
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && !isSyncing) {
      console.log("Network connection detected, triggering meter sync")
      syncUnusedMeterSerialNumbers()
        .then((result) => {
          console.log("Network-triggered meter sync result:", result)
        })
        .catch((error) => {
          console.error("Error during network-triggered meter sync:", error)
        })
    }
  })

  // Return cleanup function
  return () => {
    if (syncInterval) {
      clearInterval(syncInterval)
      syncInterval = null
    }
    unsubscribe()
    console.log("Stopped meter sync")
  }
}

// Stop periodic sync
export const stopMeterSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.log("Stopped meter sync")
    return true
  }
  return false
}

// Force a full sync
export const forceFullSync = async () => {
  console.log("Forcing full sync of unused meter serial numbers")
  return syncUnusedMeterSerialNumbers(true)
}

// Get sync status
export const getSyncStatus = async () => {
  const stats = await getMeterSyncStats()

  return {
    ...stats,
    isSyncing,
    retryCount,
    lastError,
    isActive: !!syncInterval,
  }
}

// Validate a meter serial number
export const validateMeterSerialNumber = async (serialNumber) => {
  try {
    // Get all unused meter serial numbers from the local database
    const unusedSerialNumbers = await getAllUnusedMeterSerialNumbers()

    // Check if the serial number is in the list
    return unusedSerialNumbers.includes(serialNumber)
  } catch (error) {
    console.error("Error validating meter serial number:", error)
    return false
  }
}

