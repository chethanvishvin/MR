import AsyncStorage from "@react-native-async-storage/async-storage"
import NetInfo from "@react-native-community/netinfo"
import {
  getLastSyncTimestamp,
  updateLastSyncTimestamp,
  saveUnusedMeterSerialNumbers,
  clearUnusedMeterSerialNumbers,
} from "./databaseUtils"
import { Alert, ToastAndroid, Platform } from "react-native"

// API endpoint for fetching meter information
const METER_INFO_API_URL = "https://gescom.vishvin.com/api/Contractort_meter_information"

let isSyncing = false
let lastSyncError = null
const syncListeners = []

// Show toast message (Android) or alert (iOS)
const showMessage = (message, isError = false) => {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT)
  } else if (isError) {
    // Only show alerts for errors on iOS
    Alert.alert("Sync Error", message)
  }
}

// Add sync listener
export const addSyncListener = (listener) => {
  if (typeof listener === "function" && !syncListeners.includes(listener)) {
    syncListeners.push(listener)
    return true
  }
  return false
}

// Remove sync listener
export const removeSyncListener = (listener) => {
  const index = syncListeners.indexOf(listener)
  if (index !== -1) {
    syncListeners.splice(index, 1)
    return true
  }
  return false
}

// Notify all sync listeners
const notifySyncListeners = (status, error = null) => {
  syncListeners.forEach((listener) => {
    try {
      listener(status, error)
    } catch (err) {
      console.error("Error in sync listener:", err)
    }
  })
}

// Fetch meter information from the API
export const fetchMeterInformation = async () => {
  try {
    // Get auth token
    const token = await AsyncStorage.getItem("userToken")
    if (!token) {
      console.error("No auth token available for meter information sync")
      throw new Error("Authentication token not available")
    }

    // Make the API request to the contractor meter information endpoint
    console.log(`Fetching meter information from ${METER_INFO_API_URL}`)

    const response = await fetch(METER_INFO_API_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      timeout: 30000, // 30 second timeout
    })

    console.log(`API Response Status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`API request failed with status ${response.status}: ${errorText}`)
      throw new Error(`API request failed with status ${response.status}: ${errorText}`)
    }

    const data = await response.json()

    if (!data) {
      throw new Error("Empty response from API")
    }

    if (data.status !== "success") {
      console.error("API returned non-success status:", data.status)
      throw new Error(`API returned status: ${data.status}`)
    }

    if (!data.user_information || !Array.isArray(data.user_information)) {
      console.error("Invalid response format - missing or invalid user_information:", data)
      throw new Error("Invalid response format - missing or invalid user_information")
    }

    console.log(`Successfully fetched data for ${data.user_information.length} contractors`)

    return data
  } catch (error) {
    console.error("Error fetching meter information:", error)
    throw error
  }
}

// Sync meter serial numbers (main function called by background service)
export const syncMeterSerialNumbers = async (force = false, showNotifications = false) => {
  // Prevent multiple simultaneous syncs
  if (isSyncing) {
    console.log("Meter sync already in progress, skipping")
    return { success: false, error: "Sync already in progress" }
  }

  isSyncing = true
  lastSyncError = null

  // Notify listeners that sync started
  notifySyncListeners("started")

  try {
    // Check network connectivity
    const networkState = await NetInfo.fetch()
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      console.log("No internet connection, skipping meter sync")
      lastSyncError = "No internet connection"

      if (showNotifications) {
        showMessage("This is offline contractor information", true)
      }

      // Notify listeners that sync failed
      notifySyncListeners("failed", lastSyncError)

      isSyncing = false
      return { success: false, error: lastSyncError, offline: true }
    }

    // Get last sync timestamp
    const lastSyncTimestamp = await getLastSyncTimestamp("meter_serial_numbers")

    // If not forced and last sync was less than 30 seconds ago, skip
    if (!force && lastSyncTimestamp) {
      const lastSync = new Date(lastSyncTimestamp)
      const now = new Date()
      const diffMs = now - lastSync
      const diffSeconds = diffMs / 1000

      if (diffSeconds < 30) {
        // console.log(`Last meter sync was ${diffSeconds.toFixed(2)} seconds ago, skipping`)
        isSyncing = false

        // Notify listeners that sync was skipped
        notifySyncListeners("skipped")

        return { success: true, skipped: true }
      }
    }

    // Fetch meter information
    let data
    try {
      data = await fetchMeterInformation()
    } catch (error) {
      lastSyncError = `Error fetching meter information: ${error.message}`
      console.error(lastSyncError)

      if (showNotifications) {
        showMessage("Error syncing unused meter serial numbers: " + error.message, true)
      }

      // Notify listeners that sync failed
      notifySyncListeners("failed", lastSyncError)

      isSyncing = false
      return { success: false, error: lastSyncError }
    }

    if (!data || !data.user_information) {
      lastSyncError = "Failed to fetch meter information or invalid response"
      console.error(lastSyncError)

      if (showNotifications) {
        showMessage("Error syncing unused meter serial numbers: No data received", true)
      }

      // Notify listeners that sync failed
      notifySyncListeners("failed", lastSyncError)

      isSyncing = false
      return { success: false, error: lastSyncError }
    }

    // Process the data
    const userInformation = data.user_information

    if (!userInformation || userInformation.length === 0) {
      lastSyncError = "No user information available"
      console.error(lastSyncError)

      if (showNotifications) {
        showMessage("No meter data available to sync", true)
      }

      // Notify listeners that sync failed
      notifySyncListeners("failed", lastSyncError)

      isSyncing = false
      return { success: false, error: lastSyncError }
    }

    // Count total unused serial numbers for reporting
    let totalUnused = 0
    let contractorsWithData = 0

    userInformation.forEach((contractor) => {
      if (contractor.unused_meter_serial_no && contractor.unused_meter_serial_no.trim() !== "") {
        const count = contractor.unused_meter_serial_no.split(",").filter((num) => num.trim() !== "").length
        totalUnused += count
        contractorsWithData++
      }
    })

    if (totalUnused === 0) {
      console.log("No unused serial numbers found in API response")

      // Still update sync timestamp even if no data
      await updateLastSyncTimestamp("meter_serial_numbers")

      if (showNotifications) {
        showMessage("No unused meter serial numbers available")
      }

      // Notify listeners that sync succeeded (even with 0 results)
      notifySyncListeners("succeeded")

      isSyncing = false
      return {
        success: true,
        saved: 0,
        totalAvailable: 0,
        contractors: userInformation.length,
        contractorsWithData: 0,
      }
    }

    // Clear existing data before saving new data
    await clearUnusedMeterSerialNumbers()

    // Save unused meter serial numbers
    const saveResult = await saveUnusedMeterSerialNumbers(userInformation, true)

    // Update last sync timestamp
    await updateLastSyncTimestamp("meter_serial_numbers")

    if (showNotifications) {
      showMessage(`Synced ${saveResult.processedCount} meter serial numbers`)
    }

    // Notify listeners that sync succeeded
    notifySyncListeners("succeeded")

    isSyncing = false
    return {
      success: true,
      saved: saveResult.processedCount,
      totalAvailable: totalUnused,
      contractors: userInformation.length,
      contractorsWithData: contractorsWithData,
    }
  } catch (error) {
    lastSyncError = `Error syncing meter serial numbers: ${error.message}`
    console.error(lastSyncError)

    if (showNotifications) {
      showMessage("Error syncing unused meter serial numbers: " + error.message, true)
    }

    // Notify listeners that sync failed
    notifySyncListeners("failed", lastSyncError)

    isSyncing = false
    return { success: false, error: lastSyncError }
  }
}

// Get last sync error
export const getLastSyncError = () => {
  return lastSyncError
}

// Get sync status
export const getSyncStatus = () => {
  return {
    isSyncing,
    lastSyncError,
  }
}

export default {
  fetchMeterInformation,
  syncMeterSerialNumbers,
  addSyncListener,
  removeSyncListener,
  getLastSyncError,
  getSyncStatus,
}
