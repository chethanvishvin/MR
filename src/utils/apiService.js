import axios from "axios"
import AsyncStorage from "@react-native-async-storage/async-storage"
import RNFS from "react-native-fs"
import {
  getPendingOldMeterData,
  getPendingNewMeterData,
  markOldMeterDataAsUploaded,
  markNewMeterDataAsUploaded,
  markMeterDataWithError,
} from "./databaseUtils"
import { checkInternetConnection, fetchWithTimeout } from "./networkUtils"
import { Platform } from "react-native"

const BASE_URL = "https://hdgu.vishvin.com/mobile-app/api"

export const fetchSectionCodes = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/sectceion_codes`)

    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      return response.data.data
    } else {
      console.warn("Unexpected or empty section codes data format")
      return []
    }
  } catch (error) {
    console.error("Error fetching section codes:", error)
    throw error
  }
}

export const fetchSectionCustomers = async (sectionCode) => {
  try {
    console.log("Fetching customers for section:", sectionCode)

    // Create a request with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await axios.get(`${BASE_URL}/section/fetch`, {
      params: { so_pincode: sectionCode },
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })

    clearTimeout(timeoutId)

    console.log("Raw section customers response:", JSON.stringify(response.data, null, 2))

    if (response.data && response.data.status) {
      return response.data.data || []
    } else {
      console.error("Invalid response format:", response.data)
      throw new Error("Invalid response format")
    }
  } catch (error) {
    console.error(
      "Error fetching section customers:",
      error.response ? JSON.stringify(error.response.data) : error.message,
    )

    // Provide more detailed error information
    if (error.code === "ECONNABORTED" || error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.")
    } else if (error.response) {
      throw new Error(`Server error: ${error.response.status} - ${error.response.data?.message || "Unknown error"}`)
    } else if (error.request) {
      throw new Error("Network error: No response received from server")
    } else {
      throw error
    }
  }
}

// API base URLs
const API_BASE_URL = "https://gescom.vishvin.com/api"
const MOBILE_APP_API_URL = "https://gescom.vishvin.com/mobile-app/api"
const OLD_METER_UPLOAD_URL = `${API_BASE_URL}/old-meter-upload`
const NEW_METER_UPLOAD_URL = `${API_BASE_URL}/new-meter-upload`
const FETCH_NEW_METER_URL = `${API_BASE_URL}/fetch-new-meter`
const ACCOUNT_SEARCH_URL = `${MOBILE_APP_API_URL}/fe/account_id_rr_no/search`

// Debug function to log request details
const logRequestDetails = (url, method, headers, body) => {
  console.log(`----- API REQUEST DETAILS -----`)
  console.log(`URL: ${url}`)
  console.log(`Method: ${method}`)
  console.log(`Headers:`, JSON.stringify(headers, null, 2))

  if (body instanceof FormData && body._parts) {
    console.log(`Body: FormData with fields:`)
    body._parts.forEach((part) => {
      if (typeof part[1] === "object" && part[1].uri) {
        console.log(`  ${part[0]}: [File] ${part[1].name} (${part[1].type})`)
      } else {
        console.log(`  ${part[0]}: ${part[1]}`)
      }
    })
  } else {
    console.log(`Body:`, body)
  }
  console.log(`-----------------------------`)
}

// Helper function to get auth token
const getAuthToken = async () => {
  try {
    const token = await AsyncStorage.getItem("userToken")
    if (!token) {
      console.error("No auth token available")
      throw new Error("Authentication token not available")
    }
    return token
  } catch (error) {
    console.error("Error getting auth token:", error)
    throw error
  }
}

// Helper function to create a file object for form data
const createFileObject = async (uri, fieldName) => {
  if (!uri) return null

  try {
    // Check if file exists
    const fileExists = await RNFS.exists(uri)
    if (!fileExists) {
      console.log(`File does not exist: ${uri}`)
      return null
    }

    // Get file info
    const fileInfo = await RNFS.stat(uri)
    console.log(`File info for ${fieldName}:`, fileInfo)

    // Extract file name and extension
    const uriParts = uri.split("/")
    const fileName = uriParts[uriParts.length - 1]

    // Determine mime type based on extension
    let mimeType = "image/jpeg" // Default
    if (fileName.toLowerCase().endsWith(".png")) {
      mimeType = "image/png"
    } else if (fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg")) {
      mimeType = "image/jpeg"
    }

    // For Android, we need to fix the file:// URI
    let fileUri = uri
    if (Platform.OS === "android" && !uri.startsWith("content://")) {
      fileUri = uri.startsWith("file://") ? uri : `file://${uri}`
    }

    return {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    }
  } catch (error) {
    console.error(`Error creating file object for ${fieldName}:`, error)
    return null
  }
}

// Helper function to add delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Create server instance before uploading data with retry mechanism
export const createServerInstance = async (accountId, retryCount = 0) => {
  const maxRetries = 3
  const retryDelay = 2000 // 2 seconds

  console.log(`Creating server instance for account ID: ${accountId} (attempt ${retryCount + 1}/${maxRetries + 1})`)
  
  try {
    // Validate account ID
    if (!accountId || accountId.toString().trim() === "") {
      console.error("Invalid account ID provided to createServerInstance")
      return {
        success: false,
        error: "Invalid account ID",
        isValidationError: true,
      }
    }

    // Get auth token
    const token = await getAuthToken()

    // Set up headers
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    }

    // Make the request with the correct endpoint and GET method with query parameter
    const url = `${ACCOUNT_SEARCH_URL}?account_id=${encodeURIComponent(accountId)}`
    console.log(`Calling server instance API: ${url}`)

    // Use fetch with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000) // 20 second timeout

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log(`Server instance API response status: ${response.status}`)

      // Read response text
      let responseText = ""
      try {
        responseText = await response.text()
        console.log(`Server instance API response text: ${responseText}`)
      } catch (textError) {
        console.error("Could not read response text:", textError)
        
        // Retry on read error
        if (retryCount < maxRetries) {
          console.log(`Retrying server instance creation after read error...`)
          await delay(retryDelay)
          return createServerInstance(accountId, retryCount + 1)
        }
        
        return {
          success: false,
          error: "Could not read server response",
          isNetworkError: true,
        }
      }

      // For successful responses (200-299), try to parse JSON
      if (response.ok) {
        let data = null
        if (responseText && responseText.trim() !== "") {
          try {
            data = JSON.parse(responseText)
            console.log("Parsed server instance response:", data)
          } catch (parseError) {
            console.log("Could not parse JSON response, but status is OK")
            data = { message: "Server instance created successfully" }
          }
        } else {
          data = { message: "Server instance created successfully" }
        }

        // Add a small delay to ensure server instance is fully ready
        console.log("Server instance created successfully, waiting 3 seconds for server to be ready...")
        await delay(3000)

        return {
          success: true,
          data: data,
          status: response.status,
          rawResponse: responseText,
        }
      }

      // Handle 500 errors with retry
      if (response.status === 500 && retryCount < maxRetries) {
        console.log(`Server returned 500 error, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`)
        await delay(retryDelay)
        return createServerInstance(accountId, retryCount + 1)
      }

      // For error responses, try to parse error details
      let errorData = null
      if (responseText && responseText.trim() !== "") {
        try {
          errorData = JSON.parse(responseText)
        } catch (parseError) {
          console.log("Could not parse error response JSON")
        }
      }

      // Handle specific error cases
      if (response.status === 401) {
        return {
          success: false,
          error: "Authentication failed",
          status: response.status,
          isAuthError: true,
        }
      }

      if (response.status === 404) {
        return {
          success: false,
          error: "Account not found",
          status: response.status,
          data: errorData,
        }
      }

      return {
        success: false,
        error: errorData?.message || `Server error: ${response.status}`,
        status: response.status,
        data: errorData,
        rawResponse: responseText,
      }
    } catch (fetchError) {
      clearTimeout(timeoutId)

      // Handle timeout with retry
      if (fetchError.name === "AbortError") {
        console.error("Server instance request timed out")
        
        if (retryCount < maxRetries) {
          console.log(`Retrying server instance creation after timeout...`)
          await delay(retryDelay)
          return createServerInstance(accountId, retryCount + 1)
        }
        
        return {
          success: false,
          error: "Request timed out after multiple attempts. Please check your internet connection and try again.",
          isNetworkError: true,
        }
      }

      // Handle other fetch errors with retry
      console.error("Fetch error in createServerInstance:", fetchError)
      
      if (retryCount < maxRetries) {
        console.log(`Retrying server instance creation after fetch error...`)
        await delay(retryDelay)
        return createServerInstance(accountId, retryCount + 1)
      }
      
      return {
        success: false,
        error: `Network error: ${fetchError.message}`,
        isNetworkError: true,
      }
    }
  } catch (error) {
    console.error("Exception in createServerInstance:", error)

    // Handle authentication errors
    if (error.message.includes("Authentication token not available")) {
      return {
        success: false,
        error: "Authentication token not available",
        isAuthError: true,
      }
    }

    // Retry on general errors
    if (retryCount < maxRetries) {
      console.log(`Retrying server instance creation after exception...`)
      await delay(retryDelay)
      return createServerInstance(accountId, retryCount + 1)
    }

    return {
      success: false,
      error: error.message || "Unknown error",
      isNetworkError: error.message.includes("network") || error.message.includes("fetch"),
    }
  }
}

// Validate meter serial number
export const validateMeterSerialNumber = async (serialNumber) => {
  console.log("Validating meter serial number:", serialNumber)
  try {
    // Check if we have internet connectivity
    const isConnected = await checkInternetConnection()
    if (!isConnected) {
      console.log("No internet connection")
      return {
        success: false,
        error: "No internet connection. This app requires an internet connection to validate serial numbers.",
      }
    }

    // Get auth token
    const token = await getAuthToken()
    console.log("Auth token retrieved for validation:", token ? "Yes" : "No")

    // Set up headers with proper authorization
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    }

    // Make the request with retry
    try {
      // Use GET with query parameter
      const url = `${FETCH_NEW_METER_URL}?serial_no_new=${serialNumber}`
      console.log("Fetching from URL:", url)
      console.log("Headers:", JSON.stringify(headers))

      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: headers,
        },
        10000, // 10 second timeout
        2, // 2 retries
      )

      // Log the response status for debugging
      console.log("API response status:", response.status)

      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`API validation failed with status ${response.status}: ${errorText}`)
        return {
          success: false,
          error: `API validation failed with status ${response.status}`,
          status: response.status,
          rawResponse: errorText,
        }
      }

      // Parse response
      const data = await response.json()
      console.log("Validation response:", JSON.stringify(data))

      // Check if the serial number is in the unused_meter_serial_no list
      if (data.success && data.data && data.data.unused_meter_serial_no) {
        const unusedSerialNumbers = data.data.unused_meter_serial_no.split(",").map((sn) => sn.trim())
        console.log("Unused serial numbers:", unusedSerialNumbers)
        console.log("Checking if", serialNumber, "is in unused list")

        // Check for exact match only
        const isUnused = unusedSerialNumbers.includes(serialNumber)
        console.log("Is unused:", isUnused)

        if (isUnused) {
          return {
            success: true,
            data: data,
            unusedSerialNumbers: unusedSerialNumbers,
            error: null,
          }
        } else {
          return {
            success: false,
            data: data,
            unusedSerialNumbers: unusedSerialNumbers,
            error: "Serial number is not available for use",
          }
        }
      }

      return {
        success: false,
        data: data,
        error: "Serial number not found in unused list",
      }
    } catch (error) {
      console.error("Error validating meter serial number:", error)
      return {
        success: false,
        error: error.message || "Failed to validate serial number",
        isNetworkError: error.name === "AbortError" || error.message.includes("network"),
      }
    }
  } catch (error) {
    console.error("Exception in validateMeterSerialNumber:", error)
    return {
      success: false,
      error: error.message || "Unknown error",
    }
  }
}

// Upload old meter data with retry mechanism
export const uploadOldMeterData = async (data, retryCount = 0) => {
  const maxRetries = 2
  const retryDelay = 3000 // 3 seconds

  console.log(`Starting upload of old meter data to API (attempt ${retryCount + 1}/${maxRetries + 1})...`)
  
  try {
    // First check if we have internet connectivity
    const isConnected = await checkInternetConnection()
    if (!isConnected) {
      console.log("No internet connection, cannot upload")
      return {
        success: false,
        error: "No internet connection. This app requires an internet connection to upload data.",
      }
    }

    // CRITICAL: Check if account_id is missing
    if (!data.account_id) {
      console.error("ERROR: account_id is missing in the data")
      return {
        success: false,
        error: "Missing account_id - this field is required",
      }
    }

    // Get auth token
    const token = await getAuthToken()
    console.log("Auth token retrieved:", token.substring(0, 10) + "...")

    // Check if data is already FormData
    let formData = data
    if (!(data instanceof FormData)) {
      // Create form data
      formData = new FormData()

      // CRITICAL: Ensure account_id is set correctly
      console.log("Using account_id for upload:", data.account_id)
      formData.append("account_id", data.account_id.toString())

      // Add other text fields
      formData.append("serial_no_old", data.serial_no_old || data.serialNumber || "")
      formData.append("mfd_year_old", data.mfd_year_old || data.manufactureYear || "")
      formData.append("final_reading", data.final_reading || data.finalReading || "")

      // Convert category name to match API expectations
      let categoryValue = "EM"
      if (data.meter_category) {
        categoryValue = data.meter_category
      } else if (data.category) {
        categoryValue = data.category
      } else if (data.meterCategory) {
        if (data.meterCategory === "Electromechanical") {
          categoryValue = "EM"
        } else if (data.meterCategory === "MNR") {
          categoryValue = "MNR"
        } else if (data.meterCategory === "DC") {
          categoryValue = "DC"
        } else if (data.meterCategory === "RNV") {
          categoryValue = "RNV"
        }
      }
      console.log("Using category value for upload:", categoryValue)
      formData.append("category", categoryValue)

      // Make sure meter_make_old is set
      const meterMakeOld = data.meter_make_old || data.meter_make || data.meterMake || ""
      console.log("Using meter_make_old value:", meterMakeOld)
      formData.append("meter_make_old", meterMakeOld)

      // Add created_by field
      formData.append("created_by", data.created_by || "0")

      // Process images
      if (data.image_1_old || data.photo1) {
        try {
          const imageUri = data.image_1_old || data.photo1
          const fileObj = await createFileObject(imageUri, "image_1_old")
          if (fileObj) {
            formData.append("image_1_old", fileObj)
          }
        } catch (imgError) {
          console.error("Error processing image_1_old:", imgError)
          return {
            success: false,
            error: "Failed to process first photo: " + imgError.message,
          }
        }
      }

      if (data.image_2_old || data.photo2) {
        try {
          const imageUri = data.image_2_old || data.photo2
          const fileObj = await createFileObject(imageUri, "image_2_old")
          if (fileObj) {
            formData.append("image_2_old", fileObj)
          }
        } catch (imgError) {
          console.error("Error processing image_2_old:", imgError)
          return {
            success: false,
            error: "Failed to process second photo: " + imgError.message,
          }
        }
      }
    }

    // Log the complete FormData contents before sending
    console.log("FormData fields for upload:")
    if (formData._parts) {
      formData._parts.forEach((part) => {
        if (typeof part[1] === "object" && part[1].uri) {
          console.log(`  ${part[0]}: [File] ${part[1].name}`)
        } else {
          console.log(`  ${part[0]}: ${part[1]}`)
        }
      })
    }

    // FINAL CHECK: Verify account_id is in the FormData and not undefined
    let accountIdValue = null
    let categoryValue = null
    if (formData._parts) {
      for (const part of formData._parts) {
        if (part[0] === "account_id") {
          accountIdValue = part[1]
        }
        if (part[0] === "category") {
          categoryValue = part[1]
        }
      }
    }

    if (!accountIdValue) {
      console.error("CRITICAL ERROR: account_id is still missing or undefined in the final FormData!")
      return {
        success: false,
        error: "account_id is required but is missing or undefined",
      }
    }

    if (!categoryValue) {
      console.error("CRITICAL ERROR: category is missing or undefined in the final FormData!")
      return {
        success: false,
        error: "category is required but is missing or undefined",
      }
    }

    console.log("FINAL CHECK - account_id is set to:", accountIdValue)
    console.log("FINAL CHECK - category is set to:", categoryValue)

    // Set up headers - IMPORTANT: Don't set Content-Type for multipart/form-data
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    }

    // Log request details
    logRequestDetails(OLD_METER_UPLOAD_URL, "POST", headers, formData)

    // Make the request
    console.log("Sending request to:", OLD_METER_UPLOAD_URL)

    // Use XMLHttpRequest instead of fetch for better multipart/form-data handling
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          console.log("XHR Response Status:", xhr.status)
          console.log("XHR Response Text:", xhr.responseText)

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve({ success: true, data: response })
            } catch (parseError) {
              console.error("Error parsing response:", parseError)
              resolve({
                success: false,
                error: "Invalid response format",
                status: xhr.status,
                rawResponse: xhr.responseText,
              })
            }
          } else if (xhr.status === 500 && retryCount < maxRetries) {
            // Retry on 500 error
            console.log(`Server returned 500 error, retrying old meter upload in ${retryDelay}ms...`)
            setTimeout(async () => {
              try {
                const retryResult = await uploadOldMeterData(data, retryCount + 1)
                resolve(retryResult)
              } catch (retryError) {
                resolve({
                  success: false,
                  error: "Retry failed: " + retryError.message,
                  status: xhr.status,
                })
              }
            }, retryDelay)
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText)
              resolve({
                success: false,
                error: errorResponse.message || "API request failed",
                status: xhr.status,
                data: errorResponse,
              })
            } catch (parseError) {
              resolve({
                success: false,
                error: "Request failed with status " + xhr.status,
                status: xhr.status,
                rawResponse: xhr.responseText,
              })
            }
          }
        }
      }

      xhr.onerror = () => {
        console.error("XHR Error:", xhr.statusText)
        if (retryCount < maxRetries) {
          console.log(`Network error, retrying old meter upload in ${retryDelay}ms...`)
          setTimeout(async () => {
            try {
              const retryResult = await uploadOldMeterData(data, retryCount + 1)
              resolve(retryResult)
            } catch (retryError) {
              resolve({
                success: false,
                error: "Retry failed: " + retryError.message,
                status: xhr.status,
              })
            }
          }, retryDelay)
        } else {
          resolve({
            success: false,
            error: "Network request failed after multiple attempts",
            status: xhr.status,
          })
        }
      }

      xhr.open("POST", OLD_METER_UPLOAD_URL, true)

      // Set headers
      xhr.setRequestHeader("Authorization", `Bearer ${token}`)
      xhr.setRequestHeader("Accept", "application/json")

      // Set timeout to 45 seconds
      xhr.timeout = 45000
      xhr.ontimeout = () => {
        console.error("Request timed out")
        if (retryCount < maxRetries) {
          console.log(`Request timed out, retrying old meter upload in ${retryDelay}ms...`)
          setTimeout(async () => {
            try {
              const retryResult = await uploadOldMeterData(data, retryCount + 1)
              resolve(retryResult)
            } catch (retryError) {
              resolve({
                success: false,
                error: "Retry failed: " + retryError.message,
                status: 0,
              })
            }
          }, retryDelay)
        } else {
          resolve({
            success: false,
            error: "Request timed out after multiple attempts",
            status: 0,
          })
        }
      }

      // Send the form data
      xhr.send(formData)
    })
  } catch (error) {
    console.error("Exception in uploadOldMeterData:", error)
    
    if (retryCount < maxRetries) {
      console.log(`Exception occurred, retrying old meter upload in ${retryDelay}ms...`)
      await delay(retryDelay)
      return uploadOldMeterData(data, retryCount + 1)
    }
    
    return { success: false, error: error.message || "Unknown error" }
  }
}

// Upload new meter data with retry mechanism
export const uploadNewMeterData = async (data, retryCount = 0) => {
  const maxRetries = 2
  const retryDelay = 3000 // 3 seconds

  console.log(`Starting upload of new meter data to API (attempt ${retryCount + 1}/${maxRetries + 1})...`)
  
  try {
    // First check if we have internet connectivity
    const isConnected = await checkInternetConnection()
    if (!isConnected) {
      console.log("No internet connection, cannot upload")
      return {
        success: false,
        error: "No internet connection. This app requires an internet connection to upload data.",
      }
    }

    // CRITICAL: Check if account_id is missing
    if (!data.account_id) {
      console.error("ERROR: account_id is missing in the data")
      return {
        success: false,
        error: "Missing account_id - this field is required",
      }
    }

    // Get auth token
    const token = await getAuthToken()
    console.log("Auth token retrieved:", token ? token.substring(0, 10) + "..." : "No token")

    // Check if data is already FormData
    let formData = data
    if (!(data instanceof FormData)) {
      // Create form data
      formData = new FormData()

      // Add text fields
      formData.append("account_id", data.account_id.toString())
      formData.append("meter_make_new", data.meter_make_new || "")
      formData.append("serial_no_new", data.serial_no_new || "")
      formData.append("mfd_year_new", data.mfd_year_new || "")

      // Only use the specific kwh and kvah fields, not the generic initial_reading
      const initialReading = String(data.initial_reading || data.initial_reading_kwh || "0").trim()
      formData.append("initial_reading_kwh", initialReading)
      formData.append("initial_reading_kvah", initialReading)

      // Add created_by
      formData.append("created_by", data.created_by || "0")

      // Always provide lat/lon values, use defaults if not available
      const lat = data.lat || "0.0"
      const lon = data.lon || "0.0"
      console.log("New meter location data:", { lat, lon })
      formData.append("lat", lat)
      formData.append("lon", lon)

      // Process images
      if (data.image_1_new) {
        try {
          const fileObj = await createFileObject(data.image_1_new, "image_1_new")
          if (fileObj) {
            formData.append("image_1_new", fileObj)
          }
        } catch (imgError) {
          console.error("Error processing image_1_new:", imgError)
          return {
            success: false,
            error: "Failed to process first photo: " + imgError.message,
          }
        }
      }

      if (data.image_2_new) {
        try {
          const fileObj = await createFileObject(data.image_2_new, "image_2_new")
          if (fileObj) {
            formData.append("image_2_new", fileObj)
          }
        } catch (imgError) {
          console.error("Error processing image_2_new:", imgError)
          return {
            success: false,
            error: "Failed to process second photo: " + imgError.message,
          }
        }
      }
    } else {
      // If it's already FormData, ensure seal_number is removed
      if (formData._parts) {
        formData._parts = formData._parts.filter((part) => part[0] !== "seal_number")

        // Double check that we're not sending any seal_number field
        const hasSealNumber = formData._parts.some((part) => part[0] === "seal_number")
        if (hasSealNumber) {
          console.log("WARNING: seal_number field still present after filtering, removing again")
          formData._parts = formData._parts.filter((part) => part[0] !== "seal_number")
        }
      }

      // Ensure lat/lon are included in the FormData
      if (!formData._parts.some((part) => part[0] === "lat")) {
        formData.append("lat", "0.0")
      }
      if (!formData._parts.some((part) => part[0] === "lon")) {
        formData.append("lon", "0.0")
      }
    }

    // Log the complete FormData contents before sending
    console.log("FormData fields for upload:")
    if (formData._parts) {
      formData._parts.forEach((part) => {
        if (typeof part[1] === "object" && part[1].uri) {
          console.log(`  ${part[0]}: [File] ${part[1].name}`)
        } else {
          console.log(`  ${part[0]}: ${part[1]}`)
        }
      })
    }

    // Set up headers - IMPORTANT: Don't set Content-Type for multipart/form-data
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    }

    // Log request details
    logRequestDetails(NEW_METER_UPLOAD_URL, "POST", headers, formData)

    // Make the request
    console.log("Sending request to:", NEW_METER_UPLOAD_URL)

    // Use XMLHttpRequest instead of fetch for better multipart/form-data handling
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          console.log("XHR Response Status:", xhr.status)
          console.log("XHR Response Text:", xhr.responseText)

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve({ success: true, data: response })
            } catch (parseError) {
              console.error("Error parsing response:", parseError)
              console.error("Raw response:", xhr.responseText)
              resolve({
                success: false,
                error: "Invalid response format",
                status: xhr.status,
                rawResponse: xhr.responseText,
              })
            }
          } else if (xhr.status === 500 && retryCount < maxRetries) {
            // Retry on 500 error
            console.log(`Server returned 500 error, retrying new meter upload in ${retryDelay}ms...`)
            setTimeout(async () => {
              try {
                const retryResult = await uploadNewMeterData(data, retryCount + 1)
                resolve(retryResult)
              } catch (retryError) {
                resolve({
                  success: false,
                  error: "Retry failed: " + retryError.message,
                  status: xhr.status,
                })
              }
            }, retryDelay)
          } else {
            try {
              let errorResponse
              try {
                errorResponse = JSON.parse(xhr.responseText)
              } catch (e) {
                // If response isn't valid JSON, create a simple object
                errorResponse = {
                  message: xhr.responseText || "Server error",
                  status: xhr.status,
                }
              }

              // Log detailed error information
              console.error("API Error Response:", {
                status: xhr.status,
                response: errorResponse,
                url: NEW_METER_UPLOAD_URL,
              })

              resolve({
                success: false,
                error: errorResponse.message || "API request failed",
                status: xhr.status,
                data: errorResponse,
              })
            } catch (parseError) {
              // Handle case where response isn't valid JSON
              console.error("Error parsing error response:", parseError)
              console.error("Raw error response:", xhr.responseText)

              resolve({
                success: false,
                error: "Request failed with status " + xhr.status,
                status: xhr.status,
                rawResponse: xhr.responseText,
              })
            }
          }
        }
      }

      xhr.onerror = () => {
        console.error("XHR Error:", xhr.statusText)
        if (retryCount < maxRetries) {
          console.log(`Network error, retrying new meter upload in ${retryDelay}ms...`)
          setTimeout(async () => {
            try {
              const retryResult = await uploadNewMeterData(data, retryCount + 1)
              resolve(retryResult)
            } catch (retryError) {
              resolve({
                success: false,
                error: "Retry failed: " + retryError.message,
                status: xhr.status,
              })
            }
          }, retryDelay)
        } else {
          resolve({
            success: false,
            error: "Network request failed after multiple attempts",
            status: xhr.status,
          })
        }
      }

      xhr.open("POST", NEW_METER_UPLOAD_URL, true)

      // Set headers
      xhr.setRequestHeader("Authorization", `Bearer ${token}`)
      xhr.setRequestHeader("Accept", "application/json")

      // Set timeout to 60 seconds
      xhr.timeout = 60000
      xhr.ontimeout = () => {
        console.error("Request timed out")
        if (retryCount < maxRetries) {
          console.log(`Request timed out, retrying new meter upload in ${retryDelay}ms...`)
          setTimeout(async () => {
            try {
              const retryResult = await uploadNewMeterData(data, retryCount + 1)
              resolve(retryResult)
            } catch (retryError) {
              resolve({
                success: false,
                error: "Retry failed: " + retryError.message,
                status: 0,
              })
            }
          }, retryDelay)
        } else {
          resolve({
            success: false,
            error: "Request timed out after multiple attempts",
            status: 0,
          })
        }
      }

      // Send the form data
      xhr.send(formData)
    })
  } catch (error) {
    console.error("Exception in uploadNewMeterData:", error)
    
    if (retryCount < maxRetries) {
      console.log(`Exception occurred, retrying new meter upload in ${retryDelay}ms...`)
      await delay(retryDelay)
      return uploadNewMeterData(data, retryCount + 1)
    }
    
    return { success: false, error: error.message || "Unknown error" }
  }
}

// Upload all pending data with proper server instance creation and retry mechanisms
// CRITICAL CHANGE: If old meter upload fails, skip corresponding new meter upload
export const uploadPendingData = async () => {
  console.log("🚀 Starting upload of all pending data...")
  try {
    // First check if we have internet connectivity
    const isConnected = await checkInternetConnection()
    if (!isConnected) {
      console.log("❌ No internet connection available, skipping upload")
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
    console.log("👤 Using user ID for pending uploads:", userId || "Not available")

    // Get all pending data
    console.log("📊 Getting pending old meter data...")
    const pendingOldMeterData = await getPendingOldMeterData()
    console.log("📊 Getting pending new meter data...")
    const pendingNewMeterData = await getPendingNewMeterData()

    console.log(
      `📈 Found ${pendingOldMeterData.length} pending old meter records and ${pendingNewMeterData.length} pending new meter records`,
    )

    // If no pending data, return early
    if (pendingOldMeterData.length === 0 && pendingNewMeterData.length === 0) {
      console.log("✅ No pending data to upload")
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
    const skippedNewMeterRecords = [] // Track skipped new meter records

    // Process data in pairs - group by account_id
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
        console.log(`🏷️ Set category to ${data.category} from meterCategory ${data.meterCategory}`)
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

      // Also ensure initial_reading fields are set with valid values
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

    console.log(`🔄 Processing ${accountGroups.size} account groups`)

    // Process each account group
    for (const [accountId, group] of accountGroups) {
      console.log(`\n=== 🏢 Processing account ID: ${accountId} ===`)
      console.log(`📊 Old meter records: ${group.oldMeter.length}`)
      console.log(`📊 New meter records: ${group.newMeter.length}`)

      // Validate account ID
      if (!accountId || accountId.toString().trim() === "") {
        console.error(`❌ Invalid account ID: ${accountId}`)
        // Mark all records for this account as failed
        group.oldMeter.forEach((data) => {
          oldMeterFailures.push({
            id: data.id,
            error: "Invalid account ID",
            status: 400,
            accountId: accountId,
            originalData: data,
          })
        })
        group.newMeter.forEach((data) => {
          newMeterFailures.push({
            id: data.id,
            error: "Invalid account ID",
            status: 400,
            accountId: accountId,
            originalData: data,
          })
        })
        continue // Skip to next account
      }

      // STEP 1: Create server instance before uploading any data for this account
      console.log(`🔧 STEP 1: Creating server instance for account ID: ${accountId}`)
      const instanceResult = await createServerInstance(accountId)

      if (!instanceResult.success) {
        console.error(`❌ Failed to create server instance for account ${accountId}:`, instanceResult.error)
        
        // Check if it's an authentication error
        if (instanceResult.isAuthError) {
          console.log("🔐 Authentication error detected, marking all records as auth failures")
          // Mark all records for this account as auth failures
          group.oldMeter.forEach((data) => {
            oldMeterFailures.push({
              id: data.id,
              error: `Authentication failed: ${instanceResult.error}`,
              status: 401,
              accountId: accountId,
              originalData: data,
            })
          })
          group.newMeter.forEach((data) => {
            newMeterFailures.push({
              id: data.id,
              error: `Authentication failed: ${instanceResult.error}`,
              status: 401,
              accountId: accountId,
              originalData: data,
            })
          })
          continue // Skip to next account
        }

        // For other server instance failures, mark all records as failed
        group.oldMeter.forEach((data) => {
          oldMeterFailures.push({
            id: data.id,
            error: `Failed to create server instance: ${instanceResult.error}`,
            status: instanceResult.status || 0,
            accountId: accountId,
            originalData: data,
          })
        })
        group.newMeter.forEach((data) => {
          newMeterFailures.push({
            id: data.id,
            error: `Failed to create server instance: ${instanceResult.error}`,
            status: instanceResult.status || 0,
            accountId: accountId,
            originalData: data,
          })
        })
        continue // Skip to next account
      }

      console.log(`✅ Server instance created successfully for account ${accountId}`)

      // STEP 2: Upload old meter data for this account and track success/failure
      console.log(`📤 STEP 2: Uploading old meter data for account ${accountId}`)
      const accountOldMeterSuccess = new Set() // Track successful old meter uploads for this account
      
      for (const oldMeterData of group.oldMeter) {
        console.log(`📤 Uploading old meter record ID: ${oldMeterData.id} for account: ${accountId}`)
        try {
          // Ensure account_id is properly set
          if (!oldMeterData.account_id) {
            oldMeterData.account_id = accountId
          }

          console.log("📋 Old meter data to upload:", JSON.stringify(oldMeterData, null, 2))

          const result = await uploadOldMeterData(oldMeterData)

          if (result.success) {
            console.log(`✅ Successfully uploaded old meter record ID: ${oldMeterData.id}`)
            // CRITICAL: Delete from database after successful upload
            await markOldMeterDataAsUploaded(oldMeterData.id)
            oldMeterSuccessCount++
            accountOldMeterSuccess.add(oldMeterData.id) // Track this success
          } else {
            console.error(`❌ Failed to upload old meter record ID: ${oldMeterData.id}`, result.error)
            oldMeterFailures.push({
              id: oldMeterData.id,
              error: result.error,
              status: result.status,
              data: result.data,
              accountId: accountId,
              originalData: oldMeterData,
            })

            // Mark data with error in database
            await markMeterDataWithError(oldMeterData.id, result.error, "old")
          }
        } catch (error) {
          console.error(`❌ Exception uploading old meter record ID: ${oldMeterData.id}`, error)
          oldMeterFailures.push({
            id: oldMeterData.id,
            error: error.message || "Unknown error",
            accountId: accountId,
            originalData: oldMeterData,
          })

          // Mark data with error in database
          await markMeterDataWithError(oldMeterData.id, error.message || "Unknown error", "old")
        }
      }

      // STEP 3: Upload new meter data for this account ONLY if corresponding old meter was successful
      console.log(`📤 STEP 3: Uploading new meter data for account ${accountId}`)
      console.log(`🔍 Old meter successful uploads for this account: ${accountOldMeterSuccess.size}`)
      
      for (const newMeterData of group.newMeter) {
        console.log(`📤 Processing new meter record ID: ${newMeterData.id} for account: ${accountId}`)
        
        // CRITICAL CHECK: Only upload new meter if there was at least one successful old meter upload for this account
        if (accountOldMeterSuccess.size === 0) {
          console.log(`⚠️ SKIPPING new meter record ID: ${newMeterData.id} - No successful old meter upload for account ${accountId}`)
          skippedNewMeterRecords.push({
            id: newMeterData.id,
            accountId: accountId,
            reason: "No successful old meter upload for this account",
            originalData: newMeterData,
          })
          
          // Mark this new meter record with a specific error indicating it was skipped
          await markMeterDataWithError(
            newMeterData.id, 
            "Skipped: Old meter upload failed for this account", 
            "new"
          )
          continue // Skip this new meter record
        }

        console.log(`✅ Proceeding with new meter upload - old meter was successful for account ${accountId}`)
        
        try {
          // Ensure account_id is properly set
          if (!newMeterData.account_id) {
            newMeterData.account_id = accountId
          }

          // Ensure initial_reading fields are set with valid values
          const initialReading = String(newMeterData.initial_reading || newMeterData.initial_reading_kwh || "0").trim()
          newMeterData.initial_reading = initialReading
          newMeterData.initial_reading_kwh = initialReading
          newMeterData.initial_reading_kvah = initialReading

          // Remove seal_number if present
          if (newMeterData.seal_number) {
            delete newMeterData.seal_number
          }

          console.log("📋 New meter data to upload:", JSON.stringify(newMeterData, null, 2))

          const result = await uploadNewMeterData(newMeterData)

          if (result.success) {
            console.log(`✅ Successfully uploaded new meter record ID: ${newMeterData.id}`)
            // CRITICAL: Delete from database after successful upload
            await markNewMeterDataAsUploaded(newMeterData.id)
            newMeterSuccessCount++
          } else {
            console.error(`❌ Failed to upload new meter record ID: ${newMeterData.id}`, result.error)

            // Check if this is a duplicate serial number error
            if (
              result.isDuplicateError ||
              (result.data &&
                result.data.message &&
                (result.data.message.toLowerCase().includes("already exists") ||
                  result.data.message.toLowerCase().includes("already been taken") ||
                  result.data.message.toLowerCase().includes("account already installed"))) ||
              (result.error &&
                (result.error.toLowerCase().includes("already exists") ||
                  result.error.toLowerCase().includes("already been taken") ||
                  result.error.toLowerCase().includes("account already installed")))
            ) {
              console.log(`🔄 Duplicate serial number detected for record ID: ${newMeterData.id}`)
              newMeterFailures.push({
                id: newMeterData.id,
                error: result.error,
                status: result.status,
                data: result.data,
                isDuplicateError: true,
                serialNumber: newMeterData.serial_no_new,
                accountId: accountId,
                originalData: newMeterData,
              })

              // Mark data with error in database
              await markMeterDataWithError(
                newMeterData.id,
                `Duplicate serial number: ${newMeterData.serial_no_new}`,
                "new",
              )
            } else if (
              result.isStorageError ||
              result.status === 500 ||
              (result.error &&
                (result.error.toLowerCase().includes("disk") ||
                  result.error.toLowerCase().includes("upload") ||
                  result.error.toLowerCase().includes("driver"))) ||
              (result.data &&
                result.data.message &&
                (result.data.message.toLowerCase().includes("disk") ||
                  result.data.message.toLowerCase().includes("upload") ||
                  result.data.message.toLowerCase().includes("driver")))
            ) {
              console.log(`💾 Server storage error detected for record ID: ${newMeterData.id}`)
              newMeterFailures.push({
                id: newMeterData.id,
                error: result.error || "Server storage error",
                status: result.status,
                data: result.data,
                isStorageError: true,
                accountId: accountId,
                originalData: newMeterData,
              })

              // Mark data with error in database
              await markMeterDataWithError(newMeterData.id, result.error || "Server storage error", "new")
            } else {
              newMeterFailures.push({
                id: newMeterData.id,
                error: result.error,
                status: result.status,
                data: result.data,
                isNetworkError: result.isNetworkError || false,
                offline: result.offline || false,
                accountId: accountId,
                originalData: newMeterData,
              })

              // Mark data with error in database
              await markMeterDataWithError(newMeterData.id, result.error, "new")
            }
          }
        } catch (error) {
          console.error(`❌ Exception uploading new meter record ID: ${newMeterData.id}`, error)
          newMeterFailures.push({
            id: newMeterData.id,
            error: error.message || "Unknown error",
            accountId: accountId,
            originalData: newMeterData,
          })

          // Mark data with error in database
          await markMeterDataWithError(newMeterData.id, error.message || "Unknown error", "new")
        }
      }

      console.log(`✅ Completed processing account ID: ${accountId}\n`)
    }

    console.log(
      `\n🎉 Upload complete. Successfully uploaded ${oldMeterSuccessCount}/${pendingOldMeterData.length} old meter records and ${newMeterSuccessCount}/${pendingNewMeterData.length} new meter records`,
    )

    if (skippedNewMeterRecords.length > 0) {
      console.log(`⚠️ Skipped ${skippedNewMeterRecords.length} new meter records due to failed old meter uploads`)
    }

    if (oldMeterFailures.length > 0 || newMeterFailures.length > 0) {
      console.log("❌ Some uploads failed:", { 
        oldMeterFailures: oldMeterFailures.length, 
        newMeterFailures: newMeterFailures.length 
      })
    }

    return {
      success: oldMeterSuccessCount > 0 || newMeterSuccessCount > 0,
      oldMeterUploaded: oldMeterSuccessCount,
      newMeterUploaded: newMeterSuccessCount,
      oldMeterTotal: pendingOldMeterData.length,
      newMeterTotal: pendingNewMeterData.length,
      oldMeterFailures,
      newMeterFailures,
      skippedNewMeterRecords, // Include skipped records in the response
    }
  } catch (error) {
    console.error("❌ Error uploading pending data:", error)
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

export default {
  uploadOldMeterData,
  uploadNewMeterData,
  uploadPendingData,
  validateMeterSerialNumber,
  createServerInstance,
  fetchSectionCodes,
  fetchSectionCustomers,
}
