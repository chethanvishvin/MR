// Update the uploadPendingData function in apiService.js

import AsyncStorage from "@react-native-async-storage/async-storage"
import { checkInternetConnection } from "./checkInternetConnection"
import {
  getPendingOldMeterData,
  getPendingNewMeterData,
  uploadOldMeterData,
  uploadNewMeterData,
  markOldMeterDataAsUploaded,
  markNewMeterDataAsUploaded,
  markMeterDataWithError, // Import the missing function
} from "./apiService"

// Add this function if it doesn't exist, or update it if it does
const ensureRequiredFields = (data, customerData) => {
  // Create a new object to avoid modifying the original
  const updatedData = { ...data }

  // Ensure account_id is set
  if (!updatedData.account_id && customerData && customerData.account_id) {
    console.log(`Setting missing account_id to ${customerData.account_id}`)
    updatedData.account_id = customerData.account_id
  }

  // Ensure other required fields are set
  if (!updatedData.meter_make_old && updatedData.meterMake) {
    updatedData.meter_make_old = updatedData.meterMake
  }

  if (!updatedData.serial_no_old && updatedData.serialNumber) {
    updatedData.serial_no_old = updatedData.serialNumber
  }

  if (!updatedData.mfd_year_old && updatedData.manufactureYear) {
    updatedData.mfd_year_old = updatedData.manufactureYear
  }

  if (!updatedData.final_reading && updatedData.finalReading) {
    updatedData.final_reading = updatedData.finalReading
  }

  if (!updatedData.category && updatedData.meterCategory) {
    updatedData.category = updatedData.meterCategory
  }

  return updatedData
}

// Export the function
export { ensureRequiredFields }

export const uploadPendingData = async () => {
  console.log("Starting upload of all pending data...")
  try {
    // First check if we have internet connectivity
    const isConnected = await checkInternetConnection()
    if (!isConnected) {
      console.log("No internet connection available, skipping upload")
      return {
        success: false,
        error: "No internet connection",
        oldMeterUploaded: 0,
        newMeterUploaded: 0,
        oldMeterTotal: 0,
        newMeterTotal: 0,
      }
    }

    // Get user ID to ensure it's included in uploads
    const userId = await AsyncStorage.getItem("userId")
    console.log("Using user ID for pending uploads:", userId || "Not available")

    // Get all pending data
    console.log("Getting pending old meter data...")
    const pendingOldMeterData = await getPendingOldMeterData()
    console.log("Getting pending new meter data...")
    const pendingNewMeterData = await getPendingNewMeterData()

    // Ensure user ID is set in all pending records
    if (userId) {
      pendingOldMeterData.forEach((data) => {
        if (!data.created_by || data.created_by === "0") {
          data.created_by = userId
        }

        // Make sure meter_make_old is set
        if (!data.meter_make_old && data.meter_make) {
          data.meter_make_old = data.meter_make
        }
      })

      pendingNewMeterData.forEach((data) => {
        if (!data.created_by || data.created_by === "0") {
          data.created_by = userId
        }

        // Also ensure initial_reading fields are set with valid values
        const initialReading = String(data.initial_reading || "0").trim()
        data.initial_reading = initialReading
        data.initial_reading_kwh = initialReading
        data.initial_reading_kvah = initialReading
      })
    }

    console.log(
      `Found ${pendingOldMeterData.length} pending old meter records and ${pendingNewMeterData.length} pending new meter records`,
    )

    // If no pending data, return early
    if (pendingOldMeterData.length === 0 && pendingNewMeterData.length === 0) {
      console.log("No pending data to upload")
      return {
        success: true,
        oldMeterUploaded: 0,
        newMeterUploaded: 0,
        oldMeterTotal: 0,
        newMeterTotal: 0,
      }
    }

    let oldMeterSuccessCount = 0
    let newMeterSuccessCount = 0
    const oldMeterFailures = []
    const newMeterFailures = []

    // Upload old meter data
    console.log("Starting upload of pending old meter records...")
    for (const data of pendingOldMeterData) {
      console.log(`Uploading old meter record ID: ${data.id}`)
      try {
        // Make sure all required fields are set
        if (!data.meter_make_old && data.meter_make) {
          data.meter_make_old = data.meter_make
        }

        // Ensure category is set
        if (!data.category && data.meter_category) {
          data.category = data.meter_category === "Electromechanical" ? "EM" : data.meter_category
        }

        // Ensure created_by is set
        if (!data.created_by && userId) {
          data.created_by = userId
        }

        console.log("Old meter data to upload:", JSON.stringify(data, null, 2))

        const result = await uploadOldMeterData(data)
        if (result.success) {
          console.log(`Successfully uploaded old meter record ID: ${data.id}`)
          // CRITICAL: Mark as uploaded and remove from pending
          await markOldMeterDataAsUploaded(data.id)
          oldMeterSuccessCount++
        } else {
          console.error(`Failed to upload old meter record ID: ${data.id}`, result.error)
          // Update the error message but keep in pending for retry
          await markMeterDataWithError(
            data.id,
            true, // isOldMeter
            result.error || "Upload failed",
            false, // not uploaded
            null, // no duplicate message
            false, // not duplicate error
            false, // not storage error
          )
          oldMeterFailures.push({
            id: data.id,
            error: result.error,
            status: result.status,
            data: result.data,
          })
        }
      } catch (error) {
        console.error(`Exception uploading old meter record ID: ${data.id}`, error)
        await markMeterDataWithError(
          data.id,
          true, // isOldMeter
          error.message || "Unknown error",
          false, // not uploaded
          null, // no duplicate message
          false, // not duplicate error
          false, // not storage error
        )
        oldMeterFailures.push({ id: data.id, error: error.message || "Unknown error" })
      }
    }

    // Upload new meter data
    console.log("Starting upload of pending new meter records...")
    for (const data of pendingNewMeterData) {
      console.log(`Uploading new meter record ID: ${data.id}`)
      try {
        // Ensure initial_reading fields are set with valid values
        const initialReading = String(data.initial_reading || "0").trim()
        data.initial_reading = initialReading
        data.initial_reading_kwh = initialReading
        data.initial_reading_kvah = initialReading

        // Ensure created_by is set
        if (!data.created_by && userId) {
          data.created_by = userId
        }

        console.log("New meter data to upload:", JSON.stringify(data, null, 2))

        const result = await uploadNewMeterData(data)
        if (result.success) {
          console.log(`Successfully uploaded new meter record ID: ${data.id}`)
          // CRITICAL: Mark as uploaded and remove from pending
          await markNewMeterDataAsUploaded(data.id)
          newMeterSuccessCount++
        } else {
          console.error(`Failed to upload new meter record ID: ${data.id}`, result.error)

          // Check if this is a duplicate serial number error
          if (
            result.isDuplicateError ||
            (result.data &&
              result.data.message &&
              (result.data.message.toLowerCase().includes("already exists") ||
                result.data.message.toLowerCase().includes("already been taken")))
          ) {
            // For duplicate serial numbers, mark with special error flag
            console.log(`Duplicate serial number detected for record ID: ${data.id}`)
            await markMeterDataWithError(
              data.id,
              false, // isOldMeter
              result.error || "Duplicate serial number",
              false, // not uploaded
              "Serial number already exists in the system",
              true, // is duplicate error
              false, // is storage error
            )

            newMeterFailures.push({
              id: data.id,
              error: result.error,
              status: result.status,
              data: result.data,
              isDuplicateError: true,
              serialNumber: data.serial_no_new,
            })
          }
          // Check for server storage errors
          else if (
            result.isStorageError ||
            result.status === 500 ||
            (result.error &&
              (result.error.toLowerCase().includes("disk") ||
                result.error.toLowerCase().includes("upload") ||
                result.error.toLowerCase().includes("driver")))
          ) {
            // For server storage errors, mark with special flag
            console.log(`Server storage error detected for record ID: ${data.id}`)
            await markMeterDataWithError(
              data.id,
              false, // isOldMeter
              result.error || "Server storage error",
              false, // not uploaded
              "Server file storage system is not properly configured",
              false, // not duplicate error
              true, // is storage error
            )

            newMeterFailures.push({
              id: data.id,
              error: result.error || "Server storage error",
              status: result.status,
              data: result.data,
              isStorageError: true,
            })
          } else {
            // For other errors, mark for retry
            await markMeterDataWithError(
              data.id,
              false, // isOldMeter
              result.error || "Unknown error",
              false, // not uploaded
              null, // no duplicate message
              false, // not duplicate error
              false, // not storage error
            )

            newMeterFailures.push({
              id: data.id,
              error: result.error,
              status: result.status,
              data: result.data,
              isNetworkError: result.isNetworkError || false,
              offline: result.offline || false,
            })
          }
        }
      } catch (error) {
        console.error(`Exception uploading new meter record ID: ${data.id}`, error)
        await markMeterDataWithError(
          data.id,
          false, // isOldMeter
          error.message || "Unknown error",
          false, // not uploaded
          null, // no duplicate message
          false, // not duplicate error
          false, // not storage error
        )
        newMeterFailures.push({ id: data.id, error: error.message || "Unknown error" })
      }
    }

    console.log(
      `Upload complete. Successfully uploaded ${oldMeterSuccessCount}/${pendingOldMeterData.length} old meter records and ${newMeterSuccessCount}/${pendingNewMeterData.length} new meter records`,
    )

    if (oldMeterFailures.length > 0 || newMeterFailures.length > 0) {
      console.log("Some uploads failed:", { oldMeterFailures, newMeterFailures })
    }

    return {
      success: oldMeterSuccessCount > 0 || newMeterSuccessCount > 0,
      oldMeterUploaded: oldMeterSuccessCount,
      newMeterUploaded: newMeterSuccessCount,
      oldMeterTotal: pendingOldMeterData.length,
      newMeterTotal: pendingNewMeterData.length,
      oldMeterFailures,
      newMeterFailures,
    }
  } catch (error) {
    console.error("Error uploading pending data:", error)
    return {
      success: false,
      error: error.message || "Unknown error during upload",
      oldMeterUploaded: 0,
      newMeterUploaded: 0,
      oldMeterTotal: 0,
      newMeterTotal: 0,
    }
  }
}
