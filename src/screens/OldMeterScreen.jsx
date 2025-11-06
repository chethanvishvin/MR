"use client"

import { useState, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  StatusBar,
  ActivityIndicator,
  Modal,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native"
import { launchCamera } from "react-native-image-picker"
import AsyncStorage from "@react-native-async-storage/async-storage"
import Icon from "react-native-vector-icons/Ionicons"
import NetInfo from "@react-native-community/netinfo"
import { PermissionsAndroid } from "react-native"
import RNFS from "react-native-fs"
import { compressImage } from "../utils/imageUtils"
import { checkInternetConnection } from "../utils/networkUtils"
import { __DEV__ } from "react-native"
import AndroidStatusBarSafeView from "../components/AndroidStatusBarSafeView"
import AppHeader from "../components/AppHeader"
import MeterMakeDropdown from "../components/MeterMakeDropdown"
import { saveOldMeterCache, getOldMeterCache } from "../database/oldMeterCacheDB"
import { uploadOldMeterData, createServerInstance } from "../utils/apiService"
import { saveOldMeterData } from "../utils/databaseUtils"

const { width } = Dimensions.get("window")

const OldMeterScreen = ({ navigation, route }) => {
  const {
    customerData,
    editMode,
    failedUploadId,
    oldMeterData: existingOldMeterData,
    newMeterData: existingNewMeterData,
    cachedOldMeterData,
  } = route.params || {}

  // Initialize with existing data if in edit mode, or cached data if available
  const [meterData, setMeterData] = useState(() => {
    let initialData = {
      ...customerData,
      photo1: null,
      photo2: null,
      meterMake: "",
      serialNumber: "",
      manufactureYear: "",
      finalReading: "",
      meterCategory: "",
      previousReading: "",
      previousReadingDate: "",
    }

    if (!initialData.account_id) {
      initialData.account_id = route.params?.customerData?.account_id || customerData?.account_id
    }

    // If in edit mode, use existing old meter data
    if (editMode && existingOldMeterData) {
      initialData = {
        ...initialData,
        ...existingOldMeterData,
      }
    }
    // If not in edit mode but cached data exists, use cached data
    else if (cachedOldMeterData) {
      console.log("Auto-populating form with cached data:", cachedOldMeterData)
      initialData = {
        ...initialData,
        photo1: cachedOldMeterData.photo1,
        photo2: cachedOldMeterData.photo2,
        meterMake: cachedOldMeterData.meterMake || "",
        serialNumber: cachedOldMeterData.serialNumber || "",
        manufactureYear: cachedOldMeterData.manufactureYear || "",
        finalReading: cachedOldMeterData.finalReading || "",
        meterCategory: cachedOldMeterData.meterCategory || "",
        previousReading: cachedOldMeterData.previousReading || "",
        previousReadingDate: cachedOldMeterData.previousReadingDate || "",
        account_id: cachedOldMeterData.account_id || customerData?.account_id, // Ensure account_id is retained
      }
    }

    return initialData
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processingPhoto, setProcessingPhoto] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  const [showValidationModal, setShowValidationModal] = useState(false)
  const [readingDifference, setReadingDifference] = useState(null)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [errors, setErrors] = useState({})
  const [compressionProgress, setCompressionProgress] = useState(null)
  const [uploadAttempts, setUploadAttempts] = useState(0)
  const [lastCategorySent, setLastCategorySent] = useState(null)
  const [showDebugInfo, setShowDebugInfo] = useState(__DEV__)
  const [serverInstanceCreated, setServerInstanceCreated] = useState(false)
  const [imageValidationErrors, setImageValidationErrors] = useState({
    photo1: null,
    photo2: null,
  })
  const [imageInfo, setImageInfo] = useState({
    photo1: null,
    photo2: null,
  })
  const [validationDetails, setValidationDetails] = useState([])

  // ADD THE MISSING FUNCTION HERE
  const getCurrentMeterCategory = async () => {
    // First check state
    if (meterData.meterCategory) {
      console.log("Using meter category from state:", meterData.meterCategory)
      return meterData.meterCategory
    }

    try {
      // Check AsyncStorage
      const savedCategory = await AsyncStorage.getItem("selectedMeterCategory")
      if (savedCategory) {
        console.log("Using meter category from AsyncStorage:", savedCategory)
        return savedCategory
      }
    } catch (error) {
      console.error("Error getting meter category from AsyncStorage:", error)
    }

    try {
      // Check oldMeterData in AsyncStorage
      const savedData = await AsyncStorage.getItem("oldMeterData")
      if (savedData) {
        const parsedData = JSON.parse(savedData)
        if (parsedData.meterCategory) {
          console.log("Using meter category from oldMeterData:", parsedData.meterCategory)
          return parsedData.meterCategory
        }
      }
    } catch (error) {
      console.error("Error getting meter category from oldMeterData:", error)
    }

    console.log("Could not find meter category from any source")
    return null
  }

  // Function to get image information
  const getImageInfo = async (uri, photoKey) => {
    if (!uri) return null

    try {
      const isRemoteUrl = uri.startsWith("http://") || uri.startsWith("https://")

      if (isRemoteUrl) {
        // For remote URLs, we can't use RNFS, so extract info from the URL
        console.log(`[v0] Processing remote URL for ${photoKey}:`, uri)

        const uriParts = uri.split(".")
        const extension = uriParts.length > 1 ? uriParts[uriParts.length - 1].toLowerCase().split("?")[0] : "unknown"

        // Determine mime type
        let mimeType = "unknown"
        if (extension === "jpg" || extension === "jpeg") mimeType = "image/jpeg"
        else if (extension === "png") mimeType = "image/png"
        else if (extension === "gif") mimeType = "image/gif"
        else if (extension === "webp") mimeType = "image/webp"

        const info = {
          exists: true,
          uri: uri,
          size: null, // Remote URLs don't have accessible size info
          sizeKB: null,
          sizeMB: null,
          extension: extension,
          mimeType: mimeType,
          filename: uri.split("/").pop().split("?")[0],
          path: uri,
          lastModified: "unknown",
          isUnder2MB: null, // Cannot determine for remote URLs
          isLocalFile: false,
          isRemoteUrl: true,
          isFromServer: true, // Assuming remote URLs are from the server
        }

        console.log(`[v0] Remote URL info for ${photoKey}:`, info)

        setImageInfo((prev) => ({
          ...prev,
          [photoKey]: info,
        }))

        return info
      } else {
        // Original logic for local files
        const fileExists = await RNFS.exists(uri)
        if (!fileExists) {
          console.log(`[v0] Local file does not exist for ${photoKey}:`, uri)
          return {
            exists: false,
            uri: uri,
            error: "File does not exist",
          }
        }

        const fileStats = await RNFS.stat(uri)
        const sizeKB = fileStats.size / 1024
        const sizeMB = fileStats.size / (1024 * 1024)

        // Get file extension
        const uriParts = uri.split(".")
        const extension = uriParts.length > 1 ? uriParts[uriParts.length - 1].toLowerCase() : "unknown"

        // Determine mime type
        let mimeType = "unknown"
        if (extension === "jpg" || extension === "jpeg") mimeType = "image/jpeg"
        else if (extension === "png") mimeType = "image/png"
        else if (extension === "gif") mimeType = "image/gif"
        else if (extension === "webp") mimeType = "image/webp"

        const info = {
          exists: true,
          uri: uri,
          size: fileStats.size,
          sizeKB: Math.round(sizeKB * 100) / 100,
          sizeMB: Math.round(sizeMB * 100) / 100,
          extension: extension,
          mimeType: mimeType,
          filename: uri.split("/").pop(),
          path: uri,
          lastModified: fileStats.mtime ? new Date(fileStats.mtime).toISOString() : "unknown",
          isUnder2MB: sizeMB <= 2,
          isLocalFile: uri.startsWith("file://") || !uri.startsWith("http"),
          isRemoteUrl: false,
        }

        console.log(`[v0] Local file info for ${photoKey}:`, info)

        setImageInfo((prev) => ({
          ...prev,
          [photoKey]: info,
        }))

        return info
      }
    } catch (error) {
      console.error(`[v0] Error getting image info for ${photoKey}:`, error)
      const errorInfo = {
        exists: false,
        uri: uri,
        error: error.message,
      }
      setImageInfo((prev) => ({
        ...prev,
        [photoKey]: errorInfo,
      }))
      return errorInfo
    }
  }

  const isValidUrl = (url) => {
    try {
      new URL(url)
      return true
    } catch (e) {
      return false
    }
  }

  // Enhanced validation functions with detailed messages
  const validateSerialNumber = (serialNumber, meterCategory) => {
    // For DC category, NO VALIDATION - allow any value including special characters and "NA"
    if (meterCategory === "DC") {
      return null
    }

    if (!serialNumber || serialNumber.trim() === "") {
      return "Serial number is required"
    }

    // Check for special characters (only alphanumeric allowed for non-DC)
    const alphanumericRegex = /^[a-zA-Z0-9]*$/
    if (!alphanumericRegex.test(serialNumber)) {
      return "Only alphanumeric characters are allowed in serial number"
    }

    // Check length (max 10 characters)
    if (serialNumber.length > 10) {
      return "Serial number cannot exceed 10 characters"
    }

    // Check for only zeros
    if (/^0+$/.test(serialNumber)) {
      return "Please enter a valid serial number (cannot be all zeros)"
    }

    return null
  }

  const validateManufactureYear = (year, meterCategory) => {
    // For DC category, NO VALIDATION - allow "0" and any other value
    if (meterCategory === "DC") {
      return null
    }

    if (!year || year.trim() === "") {
      return "Manufacture year is required"
    }

    // Check for negative numbers
    if (year.startsWith("-")) {
      return "Negative numbers are not allowed for manufacture year"
    }

    // Check if it's a valid number
    const yearNum = Number.parseInt(year)
    if (isNaN(yearNum)) {
      return "Manufacture year must be a valid number"
    }

    // Check year range (reasonable range for meter manufacture)
    const currentYear = new Date().getFullYear()
    if (yearNum < 1900 || yearNum > currentYear) {
      return `Manufacture year must be between 1900 and ${currentYear}`
    }

    // Check length (exactly 4 digits for non-DC)
    if (year.length !== 4) {
      return "Manufacture year must be exactly 4 digits"
    }

    return null
  }

  const validateFinalReading = (reading, meterCategory) => {
    if (meterCategory === "DC" || meterCategory === "MNR" || meterCategory === "RNV") {
      return null
    }

    if (reading === "" || reading === null) {
      return "Final reading is required"
    }

    // Check for negative numbers
    if (reading.startsWith("-")) {
      return "Final reading must be a positive number"
    }

    const numReading = Number.parseFloat(reading)

    if (isNaN(numReading)) {
      return "Final reading must be a valid number"
    }

    // Ensure it's positive
    if (numReading < 0) {
      return "Final reading must be a positive number"
    }

    if (numReading === 0 && meterCategory === "Electromechanical") {
      return "Final reading cannot be zero for Electromechanical meters"
    }

    return null
  }

  const validateMeterMake = (meterMake, meterCategory) => {
    // For DC category, "NA" is allowed, no other validation
    if (meterCategory === "DC") {
      return null
    }

    if (!meterMake || meterMake.trim() === "") {
      return "Meter make is required"
    }
    return null
  }

  const validateMeterCategory = (category) => {
    if (!category || category.trim() === "") {
      return "Meter category is required"
    }
    return null
  }

  const validatePhotos = () => {
    const photoErrors = {}
    if (!meterData.photo1) {
      photoErrors.photo1 = "Photo 1 is required - please take a photo of the meter with readings displayed"
    }
    if (!meterData.photo2) {
      photoErrors.photo2 = "Photo 2 is required - please take a photo of the meter with readings displayed"
    }
    return photoErrors
  }

  // Enhanced validation function that returns detailed information
  const validateAllFields = () => {
    const validationErrors = {}
    const validationDetails = []

    // Validate meter category
    const categoryError = validateMeterCategory(meterData.meterCategory)
    if (categoryError) {
      validationErrors.meterCategory = categoryError
      validationDetails.push({
        field: "Meter Category",
        value: meterData.meterCategory || "Not selected",
        error: categoryError,
        status: "❌",
      })
    } else {
      validationDetails.push({
        field: "Meter Category",
        value: meterData.meterCategory,
        error: null,
        status: "✅",
      })
    }

    // Validate photos
    const photoErrors = validatePhotos()
    Object.assign(validationErrors, photoErrors)

    // Photo 1 validation details
    if (photoErrors.photo1) {
      validationDetails.push({
        field: "Photo 1",
        value: meterData.photo1 ? "Image captured" : "No image",
        error: photoErrors.photo1,
        status: "❌",
      })
    } else {
      validationDetails.push({
        field: "Photo 1",
        value: meterData.photo1 ? "Image captured" : "No image",
        error: null,
        status: "✅",
      })
    }

    // Photo 2 validation details
    if (photoErrors.photo2) {
      validationDetails.push({
        field: "Photo 2",
        value: meterData.photo2 ? "Image captured" : "No image",
        error: photoErrors.photo2,
        status: "❌",
      })
    } else {
      validationDetails.push({
        field: "Photo 2",
        value: meterData.photo2 ? "Image captured" : "No image",
        error: null,
        status: "✅",
      })
    }

    // For DC category, SKIP validation for other fields
    if (meterData.meterCategory !== "DC") {
      // Validate meter make
      const meterMakeError = validateMeterMake(meterData.meterMake, meterData.meterCategory)
      if (meterMakeError) {
        validationErrors.meterMake = meterMakeError
        validationDetails.push({
          field: "Meter Make",
          value: meterData.meterMake || "Not selected",
          error: meterMakeError,
          status: "❌",
        })
      } else {
        validationDetails.push({
          field: "Meter Make",
          value: meterData.meterMake || "Not selected",
          error: null,
          status: "✅",
        })
      }

      // Validate serial number
      const serialNumberError = validateSerialNumber(meterData.serialNumber, meterData.meterCategory)
      if (serialNumberError) {
        validationErrors.serialNumber = serialNumberError
        validationDetails.push({
          field: "Serial Number",
          value: meterData.serialNumber || "Empty",
          error: serialNumberError,
          status: "❌",
        })
      } else {
        validationDetails.push({
          field: "Serial Number",
          value: meterData.serialNumber || "Empty",
          error: null,
          status: "✅",
        })
      }

      // Validate manufacture year
      const manufactureYearError = validateManufactureYear(meterData.manufactureYear, meterData.meterCategory)
      if (manufactureYearError) {
        validationErrors.manufactureYear = manufactureYearError
        validationDetails.push({
          field: "Manufacture Year",
          value: meterData.manufactureYear || "Empty",
          error: manufactureYearError,
          status: "❌",
        })
      } else {
        validationDetails.push({
          field: "Manufacture Year",
          value: meterData.manufactureYear || "Empty",
          error: null,
          status: "✅",
        })
      }

      // Validate final reading
      const finalReadingError = validateFinalReading(meterData.finalReading, meterData.meterCategory)
      if (finalReadingError) {
        validationErrors.finalReading = finalReadingError
        validationDetails.push({
          field: "Final Reading",
          value: meterData.finalReading || "Empty",
          error: finalReadingError,
          status: "❌",
        })
      } else {
        validationDetails.push({
          field: "Final Reading",
          value: meterData.finalReading || "Empty",
          error: null,
          status: "✅",
        })
      }
    } else {
      // For DC category, show auto-populated values as valid
      validationDetails.push(
        {
          field: "Meter Make",
          value: meterData.meterMake || "Auto-populated for DC",
          error: null,
          status: "✅",
        },
        {
          field: "Serial Number",
          value: meterData.serialNumber || "Auto-populated for DC",
          error: null,
          status: "✅",
        },
        {
          field: "Manufacture Year",
          value: meterData.manufactureYear || "Auto-populated for DC",
          error: null,
          status: "✅",
        },
        {
          field: "Final Reading",
          value: meterData.finalReading || "Auto-populated for DC",
          error: null,
          status: "✅",
        },
      )
    }

    return { validationErrors, validationDetails }
  }

  // Function to save data to cache database whenever it changes
  const saveToCache = async (data) => {
    try {
      if (!data.account_id) {
        console.log("No account_id available, skipping cache save")
        return
      }

      console.log("Saving data to cache database:", data.account_id)
      await saveOldMeterCache(data)
      console.log("Successfully saved to cache database")
    } catch (error) {
      console.error("Error saving to cache database:", error)
    }
  }

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true)
    })
    const keyboardDidHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false)
    })

    // Initialize data loading
    const initializeData = async () => {
      if (editMode && existingOldMeterData) {
        // Edit mode: use existing old meter data
        const updatedData = {
          ...meterData,
          ...existingOldMeterData,
        }
        setMeterData(updatedData)
        await saveToCache(updatedData)

        // Get image info for existing images
        if (updatedData.photo1) await getImageInfo(updatedData.photo1, "photo1")
        if (updatedData.photo2) await getImageInfo(updatedData.photo2, "photo2")
      } else if (cachedOldMeterData) {
        // Auto-populate mode: use cached data
        console.log("[v0] Auto-populating with cached old meter data")

        const formatImageUrl = (url) => {
          if (!url) return null
          // If it's already a full URL, return as is
          if (url.startsWith("http")) return url
          // If it's a path only, add the domain
          if (url.startsWith("uploads/")) {
            return `https://gescom.vishvin.com/${url}`
          }
          return url
        }

        const photo1Formatted = formatImageUrl(cachedOldMeterData.photo1)
        const photo2Formatted = formatImageUrl(cachedOldMeterData.photo2)

        const updatedData = {
          ...meterData,
          photo1: photo1Formatted,
          photo2: photo2Formatted,
          meterMake: cachedOldMeterData.meterMake || "",
          serialNumber: cachedOldMeterData.serialNumber || "",
          manufactureYear: cachedOldMeterData.manufactureYear || "",
          finalReading: cachedOldMeterData.finalReading || "",
          meterCategory: cachedOldMeterData.meterCategory || "",
          previousReading: cachedOldMeterData.previousReading || "",
          previousReadingDate: cachedOldMeterData.previousReadingDate || "",
        }

        console.log("[v0] Updated meter data with formatted images:", {
          photo1: photo1Formatted,
          photo2: photo2Formatted,
        })

        setMeterData(updatedData)
        await saveToCache(updatedData)

        if (photo1Formatted) {
          console.log("[v0] Getting image info for photo1:", photo1Formatted)
          await getImageInfo(photo1Formatted, "photo1")
        }
        if (photo2Formatted) {
          console.log("[v0] Getting image info for photo2:", photo2Formatted)
          await getImageInfo(photo2Formatted, "photo2")
        }

        if (photo1Formatted || photo2Formatted) {
          await validateDatabaseImages(photo1Formatted, photo2Formatted)
        }
      } else if (customerData?.account_id) {
        // Normal mode: try to load from cache first
        const cachedData = await loadFromCache(customerData.account_id)
        if (cachedData) {
          console.log("Loading existing cached data for account:", customerData.account_id)

          // Check if we have image URLs that need the domain prefix
          const formatImageUrl = (url) => {
            if (!url) return null
            // If it's already a full URL, return as is
            if (url.startsWith("http")) return url
            // If it's a path only, add the domain
            if (url.startsWith("uploads/")) {
              return `https://gescom.vishvin.com/${url}`
            }
            return url
          }

          const updatedData = {
            ...meterData,
            photo1: formatImageUrl(cachedData.photo1),
            photo2: formatImageUrl(cachedData.photo2),
            meterMake: cachedData.meterMake || "",
            serialNumber: cachedData.serialNumber || "",
            manufactureYear: cachedData.manufactureYear || "",
            finalReading: cachedData.finalReading || "",
            meterCategory: cachedData.meterCategory || "",
            previousReading: cachedData.previousReading || "",
            previousReadingDate: cachedData.previousReadingDate || "",
          }
          setMeterData(updatedData)

          // Get image info for cached images
          if (updatedData.photo1) await getImageInfo(updatedData.photo1, "photo1")
          if (updatedData.photo2) await getImageInfo(updatedData.photo2, "photo2")
        } else {
          // No cached data, save initial data
          await saveToCache(meterData)
        }
      }
    }

    initializeData()

    if (customerData && customerData.account_id) {
      console.log("Setting account_id in OldMeterScreen:", customerData.account_id)
      setMeterData((prevData) => {
        const updatedData = {
          ...prevData,
          account_id: customerData.account_id,
        }
        // Save to cache when account_id is set
        saveToCache(updatedData)
        return updatedData
      })

      AsyncStorage.setItem(
        "oldMeterData",
        JSON.stringify({
          ...meterData,
          account_id: customerData.account_id,
        }),
      )
    }

    checkNetworkStatus()

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected && state.isInternetReachable)
    })

    return () => {
      keyboardDidShowListener.remove()
      keyboardDidHideListener.remove()
      unsubscribe()
    }
  }, [editMode, existingOldMeterData, customerData, cachedOldMeterData])

  const loadFromCache = async (accountId) => {
    try {
      if (!accountId) {
        console.log("No account_id provided for cache loading")
        return null
      }

      console.log("Loading data from cache database for account:", accountId)
      const cachedData = await getOldMeterCache(accountId)

      if (cachedData) {
        console.log("Found cached data:", cachedData)
        return cachedData
      } else {
        console.log("No cached data found for account:", accountId)
        return null
      }
    } catch (error) {
      console.error("Error loading from cache database:", error)
      return null
    }
  }

  const fetchPreviousReading = async (accountId) => {
    try {
      if (customerData?.previous_final_reading && customerData?.billed_date) {
        console.log("Using previous reading data from customer data:", {
          previous_final_reading: customerData.previous_final_reading,
          billed_date: customerData.billed_date,
        })

        const updatedData = {
          ...meterData,
          previousReading: customerData.previous_final_reading,
          previousReadingDate: customerData.billed_date || "N/A",
        }
        setMeterData(updatedData)
        await saveToCache(updatedData)
        return
      }

      try {
        const { getCustomerData } = require("../database/database")
        const localCustomerData = await getCustomerData(accountId)

        if (localCustomerData?.previous_final_reading && localCustomerData?.billed_date) {
          console.log("Using previous reading data from local database:", {
            previous_final_reading: localCustomerData.previous_final_reading,
            billed_date: localCustomerData.billed_date,
          })

          const updatedData = {
            ...meterData,
            previousReading: localCustomerData.previous_final_reading,
            previousReadingDate: localCustomerData.billed_date || "N/A",
          }
          setMeterData(updatedData)
          await saveToCache(updatedData)
          return
        }
      } catch (dbError) {
        console.log("Error fetching from local database:", dbError)
      }

      const networkState = await NetInfo.fetch()
      if (!networkState.isConnected || !networkState.isInternetReachable) {
        console.log("No internet connection and no local data, cannot fetch previous reading")
        return
      }

      const token = await AsyncStorage.getItem("userToken")
      if (!token) {
        console.error("No auth token available")
        return
      }

      const response = await fetch(`https://gescom.vishvin.com/api/get-consumer?account_id=${accountId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        console.error(`API request failed with status ${response.status}`)
        return
      }

      const data = await response.json()
      console.log("API response for previous reading:", data)

      if (data.status && data.previous_final_reading) {
        const updatedData = {
          ...meterData,
          previousReading: data.previous_final_reading,
          previousReadingDate: data.billed_date || "N/A",
        }
        setMeterData(updatedData)
        await saveToCache(updatedData)
      }
    } catch (error) {
      console.error("Error fetching previous reading:", error)
    }
  }

  useEffect(() => {
    if (customerData?.account_id) {
      fetchPreviousReading(customerData.account_id)
      ensureAccountId()
    }
  }, [customerData, isOnline])

  const checkNetworkStatus = async () => {
    try {
      const isConnected = await checkInternetConnection()
      setIsOnline(isConnected)
    } catch (error) {
      console.error("Error checking network status:", error)
      setIsOnline(false)
    }
  }

  const ensureAccountId = async () => {
    if (!meterData.account_id && customerData && customerData.account_id) {
      console.log(`Setting account_id from customerData: ${customerData.account_id}`)
      const updatedData = {
        ...meterData,
        account_id: customerData.account_id,
      }
      setMeterData(updatedData)
      await saveData(updatedData)
      await saveToCache(updatedData)
    }
  }

  const saveData = async (data) => {
    try {
      console.log("Saving old meter data with category:", data.meterCategory)
      await AsyncStorage.setItem("oldMeterData", JSON.stringify(data))
    } catch (error) {
      console.error("Error saving data:", error)
    }
  }

  const handleInputChange = async (key, value) => {
    const newData = {
      ...meterData,
      [key]: value,
    }
    setMeterData(newData)
    await saveData(newData)
    await saveToCache(newData) // Save to cache database immediately

    // If it's a photo, get image info
    if (key === "photo1" || key === "photo2") {
      if (value) {
        await getImageInfo(value, key)
      } else {
        setImageInfo((prev) => ({
          ...prev,
          [key]: null,
        }))
      }
    }
  }

  const handleSerialNumberChange = async (value) => {
    // For DC category, allow any input including special characters
    // For other categories, restrict to alphanumeric
    let processedValue = value
    if (meterData.meterCategory !== "DC") {
      processedValue = value.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10)
    }

    await handleInputChange("serialNumber", processedValue)

    // Validate and set error - pass current category
    const error = validateSerialNumber(processedValue, meterData.meterCategory)
    setErrors((prev) => ({ ...prev, serialNumber: error }))
  }

  const handleManufactureYearChange = async (value) => {
    // For DC category, allow any input including "0"
    // For other categories, restrict to numbers only
    let processedValue = value
    if (meterData.meterCategory !== "DC") {
      processedValue = value.replace(/[^0-9]/g, "").substring(0, 4)
    }

    await handleInputChange("manufactureYear", processedValue)

    // Validate and set error - pass current category
    const error = validateManufactureYear(processedValue, meterData.meterCategory)
    setErrors((prev) => ({ ...prev, manufactureYear: error }))
  }

  const handleCategoryChange = async (category) => {
    console.log("Category changed to:", category)

    let newData = {
      ...meterData,
      meterCategory: category,
    }

    // Only auto-populate when DC is selected
    if (category === "DC") {
      newData = {
        ...newData,
        meterMake: "NA",
        serialNumber: "NA",
        manufactureYear: "0",
        finalReading: "0",
      }
    }
    // For other categories, don't modify existing values unless they were previously DC values
    else if (meterData.meterCategory === "DC") {
      // Clear DC values when switching away from DC
      newData = {
        ...newData,
        meterMake: "",
        serialNumber: "",
        manufactureYear: "",
        finalReading: "",
      }
    }

    setMeterData(newData)
    await saveData(newData)
    await saveToCache(newData)

    // Validate category
    const categoryError = validateMeterCategory(category)

    // For DC category, clear all field errors since validation is bypassed
    if (category === "DC") {
      setErrors({
        meterCategory: categoryError,
        // Clear all other errors for DC category
        serialNumber: null,
        manufactureYear: null,
        finalReading: null,
        meterMake: null,
      })
    } else {
      // For other categories, validate all fields
      const serialError = validateSerialNumber(newData.serialNumber, category)
      const yearError = validateManufactureYear(newData.manufactureYear, category)
      const readingError = validateFinalReading(newData.finalReading, category)
      const makeError = validateMeterMake(newData.meterMake, category)

      setErrors({
        meterCategory: categoryError,
        serialNumber: serialError,
        manufactureYear: yearError,
        finalReading: readingError,
        meterMake: makeError,
      })
    }

    try {
      AsyncStorage.setItem("selectedMeterCategory", category)
      console.log("Saved meter category to AsyncStorage:", category)
    } catch (error) {
      console.error("Error saving meter category to AsyncStorage:", error)
    }
  }

  const handleMeterMakeSelect = async (value) => {
    console.log("Meter make selected:", value)
    await handleInputChange("meterMake", value)

    // Validate meter make - pass current category
    const error = validateMeterMake(value, meterData.meterCategory)
    setErrors((prev) => ({ ...prev, meterMake: error }))
  }

  const requestCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: "Camera Permission",
        message: "This app needs access to your camera to take photos.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      })
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log("Camera permission granted")
        return true
      } else {
        console.log("Camera permission denied")
        return false
      }
    } catch (err) {
      console.warn(err)
      return false
    }
  }

  const takePhoto = async (photoKey) => {
    const options = {
      mediaType: "photo",
      quality: 0.8,
      maxWidth: 1200,
      maxHeight: 1200,
      saveToPhotos: false,
      includeBase64: false,
    }

    try {
      if (Platform.OS === "android") {
        const hasPermission = await requestCameraPermission()
        if (!hasPermission) {
          Alert.alert("Permission Denied", "Camera permission is required to take photos")
          return
        }
      }

      setProcessingPhoto(photoKey)

      // CHANGE: Clear validation errors for this photo immediately when starting to take photo
      if (errors[photoKey]) {
        setErrors((prevErrors) => {
          const newErrors = { ...prevErrors }
          delete newErrors[photoKey]
          return newErrors
        })
      }

      const response = await launchCamera(options)
      console.log("Camera response:", response)

      if (response.didCancel) {
        console.log("User cancelled image picker")
        setProcessingPhoto(null)
        return
      }

      if (response.errorCode) {
        console.error("ImagePicker Error:", response.errorMessage)
        Alert.alert("Error", "Failed to capture photo. Please try again.")
        setProcessingPhoto(null)
        return
      }

      if (response.assets && response.assets.length > 0) {
        const capturedPhoto = response.assets[0]
        console.log("Captured photo URI:", capturedPhoto.uri)

        // CHANGE: Double-check error clearing after getting the photo
        if (errors[photoKey]) {
          setErrors((prevErrors) => {
            const newErrors = { ...prevErrors }
            delete newErrors[photoKey]
            return newErrors
          })
        }

        setCompressionProgress("Compressing image to ensure it meets size requirements...")

        try {
          const maxSizeKB = 2000 // 2MB limit
          let compressedUri = capturedPhoto.uri
          let attemptCount = 0
          const maxAttempts = 3

          while (attemptCount < maxAttempts) {
            const fileStats = await RNFS.stat(compressedUri)
            const fileSizeKB = fileStats.size / 1024
            const fileSizeInMB = fileStats.size / (1024 * 1024)

            console.log(
              `[v0] Compression attempt ${attemptCount + 1}/${maxAttempts}: ${fileSizeInMB.toFixed(2)}MB (${fileSizeKB.toFixed(2)}KB)`,
            )

            // If already under 2MB, we're done
            if (fileSizeKB <= maxSizeKB) {
              console.log(`[v0] Image successfully compressed to ${fileSizeInMB.toFixed(2)}MB - within limit`)
              break
            }

            // Need more compression
            attemptCount++
            if (attemptCount >= maxAttempts) {
              throw new Error(
                `Unable to compress image below 2MB after ${maxAttempts} attempts. Final size: ${fileSizeInMB.toFixed(2)}MB`,
              )
            }

            // Apply progressive compression with decreasing quality and width
            const qualityLevels = [0.6, 0.4, 0.2]
            const widthLevels = [1000, 800, 600]
            const quality = qualityLevels[attemptCount - 1]
            const width = widthLevels[attemptCount - 1]

            console.log(`[v0] Applying compression: quality=${quality}, width=${width}`)

            compressedUri = await compressImage(compressedUri, maxSizeKB, quality, width)
            setCompressionProgress(`Compressing image... (attempt ${attemptCount + 1}/${maxAttempts})`)
          }

          console.log("Compressed photo URI:", compressedUri)

          // Final verification - ensure image is always under 2MB
          const finalStats = await RNFS.stat(compressedUri)
          const finalSizeInMB = finalStats.size / (1024 * 1024)
          console.log(`[v0] Final image size: ${finalSizeInMB.toFixed(2)}MB`)

          if (finalSizeInMB > 2) {
            throw new Error(
              `Image size (${finalSizeInMB.toFixed(2)}MB) still exceeds 2MB limit after compression. Please retake the photo.`,
            )
          }

          // Save the compressed image and clear errors
          await handleInputChange(photoKey, compressedUri)

          // CHANGE: Final error clearing after successful compression
          if (errors[photoKey]) {
            setErrors((prevErrors) => {
              const newErrors = { ...prevErrors }
              delete newErrors[photoKey]
              return newErrors
            })
          }

          console.log(`[v0] Photo ${photoKey} successfully set with size ${finalSizeInMB.toFixed(2)}MB`)
        } catch (compressionError) {
          console.error("Error compressing image:", compressionError)
          Alert.alert(
            "Image Processing Error",
            compressionError.message || "Failed to process the photo. Please try again with a lower resolution photo.",
          )
          // Keep the old photo if compression fails
        } finally {
          setCompressionProgress(null)
        }
      }
    } catch (error) {
      console.error("Error taking photo:", error)
      Alert.alert("Error", "Failed to take photo. Please try again.")
    } finally {
      setProcessingPhoto(null)
    }
  }

  const validateDatabaseImages = async (photo1, photo2) => {
    const validationErrors = {}
    const compressedImages = {}
    const compressionMessages = []

    if (photo1) {
      const { validateImageFromDatabase } = require("../utils/imageUtils")
      const validation = await validateImageFromDatabase(photo1)

      if (!validation.valid) {
        validationErrors.photo1 = validation.error
        console.warn("[v0] Photo 1 validation failed:", validation.error)
      } else if (validation.needsCompression) {
        // Image was compressed
        compressedImages.photo1 = validation.compressedUri
        compressionMessages.push("Photo 1 was automatically compressed to meet size requirements")
        console.log("[v0] Photo 1 compressed:", validation.compressedUri)
      } else {
        // Image is valid without compression
        compressedImages.photo1 = validation.compressedUri
      }
    }

    if (photo2) {
      const { validateImageFromDatabase } = require("../utils/imageUtils")
      const validation = await validateImageFromDatabase(photo2)

      if (!validation.valid) {
        validationErrors.photo2 = validation.error
        console.warn("[v0] Photo 2 validation failed:", validation.error)
      } else if (validation.needsCompression) {
        // Image was compressed
        compressedImages.photo2 = validation.compressedUri
        compressionMessages.push("Photo 2 was automatically compressed to meet size requirements")
        console.log("[v0] Photo 2 compressed:", validation.compressedUri)
      } else {
        // Image is valid without compression
        compressedImages.photo2 = validation.compressedUri
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setImageValidationErrors(validationErrors)

      // Show alert with validation errors
      let errorMessage = "The following images from the database do not meet requirements:\n\n"
      if (validationErrors.photo1) {
        errorMessage += `Photo 1: ${validationErrors.photo1}\n`
      }
      if (validationErrors.photo2) {
        errorMessage += `Photo 2: ${validationErrors.photo2}\n`
      }
      errorMessage += "\nPlease retake these photos to proceed."

      Alert.alert("Image Validation Failed", errorMessage, [
        {
          text: "OK",
          onPress: () => {
            // Clear invalid images so user can retake them
            if (validationErrors.photo1) {
              handleInputChange("photo1", null)
            }
            if (validationErrors.photo2) {
              handleInputChange("photo2", null)
            }
          },
        },
      ])
    } else {
      // Clear any previous validation errors if images are valid
      setImageValidationErrors({})

      if (compressedImages.photo1 || compressedImages.photo2) {
        setMeterData((prev) => ({
          ...prev,
          photo1: compressedImages.photo1 || prev.photo1,
          photo2: compressedImages.photo2 || prev.photo2,
        }))

        // Show compression message if images were compressed
        if (compressionMessages.length > 0) {
          const compressionAlert = compressionMessages.join("\n")
          Alert.alert(
            "Image Compression Applied",
            `${compressionAlert}\n\nImages are now optimized and ready to upload.`,
          )
        }
      }
    }
  }

  // NEW: Function to download remote image and convert to file object
  const downloadRemoteImage = async (imageUrl, fieldName) => {
    try {
      console.log(`[DOWNLOAD] Starting download for ${fieldName}: ${imageUrl}`)

      // Extract filename from URL
      const filename = imageUrl.split("/").pop() || `${fieldName}.jpg`
      const localPath = `${RNFS.TemporaryDirectoryPath}/${Date.now()}_${filename}`

      // Download the file
      const downloadResult = await RNFS.downloadFile({
        fromUrl: imageUrl,
        toFile: localPath,
        background: true,
        discretionary: true,
        progress: (res) => {
          console.log(`[DOWNLOAD] Progress for ${fieldName}: ${res.bytesWritten}/${res.contentLength}`)
        },
      }).promise

      if (downloadResult.statusCode === 200) {
        console.log(`[DOWNLOAD] Successfully downloaded ${fieldName} to: ${localPath}`)

        // Check file size and compress if needed
        const fileStats = await RNFS.stat(localPath)
        const fileSizeMB = fileStats.size / (1024 * 1024)

        let finalPath = localPath

        if (fileSizeMB > 2) {
          console.log(`[DOWNLOAD] Image ${fieldName} is too large (${fileSizeMB.toFixed(2)}MB), compressing...`)
          finalPath = await compressImage(localPath, 1800) // Compress to under 1.8MB
          console.log(`[DOWNLOAD] Compressed ${fieldName} to: ${finalPath}`)
        }

        // Create file object
        const fileObject = await createFileObject(finalPath, fieldName)
        console.log(`[DOWNLOAD] Created file object for ${fieldName}:`, fileObject)

        return fileObject
      } else {
        throw new Error(`Download failed with status: ${downloadResult.statusCode}`)
      }
    } catch (error) {
      console.error(`[DOWNLOAD] Error downloading ${fieldName}:`, error)
      throw error
    }
  }

  const createFileObject = async (uri, fieldName) => {
    if (!uri) return null

    try {
      const fileExists = await RNFS.exists(uri)
      if (!fileExists) {
        console.log(`File does not exist: ${uri}`)
        return null
      }

      try {
        const fileStats = await RNFS.stat(uri)
        console.log(`File stats for ${fieldName}:`, fileStats)

        if (fileStats.size > 2 * 1024 * 1024) {
          console.warn(`File ${fieldName} is too large: ${fileStats.size} bytes`)

          console.log("Attempting to compress oversized image again")
          const compressedUri = await compressImage(uri, 1800)

          const newStats = await RNFS.stat(compressedUri)
          console.log(`Compressed file size: ${newStats.size / 1024} KB`)

          if (newStats.size > 2 * 1024 * 1024) {
            throw new Error(
              `Image file is still too large (${Math.round(newStats.size / (1024 * 1024))}MB). Please retake the photo.`,
            )
          }

          uri = compressedUri
        }
      } catch (statError) {
        console.error(`Error getting file stats for ${fieldName}:`, statError)
        if (statError.message && statError.message.includes("too large")) {
          throw statError
        }
      }

      const uriParts = uri.split("/")
      const fileName = uriParts[uriParts.length - 1]

      const timestamp = new Date().getTime()
      const uniqueFileName = `${fieldName}_${timestamp}.jpg`

      let mimeType = "image/jpeg"
      if (fileName.toLowerCase().endsWith(".png")) {
        mimeType = "image/png"
      } else if (fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg")) {
        mimeType = "image/jpeg"
      }

      let fileUri = uri
      if (Platform.OS === "android" && !uri.startsWith("content://")) {
        fileUri = uri.startsWith("file://") ? uri : `file://${uri}`
      }

      console.log(`Creating file object for ${fieldName}:`, {
        uri: fileUri,
        name: uniqueFileName,
        type: mimeType,
      })

      return {
        uri: fileUri,
        name: uniqueFileName,
        type: mimeType,
      }
    } catch (error) {
      console.error(`Error creating file object for ${fieldName}:`, error)
      throw error
    }
  }

  const handleFinalReadingChange = async (value) => {
    let numericValue = value.replace(/[^0-9.]/g, "")

    // Prevent multiple decimal points
    if (numericValue.includes(".")) {
      const parts = numericValue.split(".")
      // Keep the first part and only the first two digits after the decimal
      numericValue = parts[0] + "." + parts.slice(1).join("").substring(0, 2)
    }

    await handleInputChange("finalReading", numericValue)
    const error = validateFinalReading(numericValue, meterData.meterCategory)
    setErrors((prev) => ({ ...prev, finalReading: error }))

    if (meterData.previousReading && numericValue) {
      const finalReading = Number.parseFloat(numericValue)
      const previousReading = Number.parseFloat(meterData.previousReading)
      if (!isNaN(finalReading) && !isNaN(previousReading)) {
        const difference = finalReading - previousReading
        setReadingDifference(difference)
      } else {
        setReadingDifference(null)
      }
    } else {
      setReadingDifference(null)
    }
  }

  const handleCategoryChangeAndValidate = async (category) => {
    await handleCategoryChange(category)
    const error = validateFinalReading(meterData.finalReading, category)
    setErrors((prev) => ({ ...prev, finalReading: error }))
  }

  const validateReadings = () => {
    if (meterData.finalReading && meterData.previousReading) {
      const finalReading = Number.parseFloat(meterData.finalReading)
      const previousReading = Number.parseFloat(meterData.previousReading)

      const difference = finalReading - previousReading
      setReadingDifference(difference)

      setShowValidationModal(true)
    }
    return true
  }

  // FIXED: Enhanced handleNext function with proper account_id handling
  const handleNext = async () => {
    if (isSubmitting) return

    console.log("=== VALIDATION START ===")

    console.log("Debug - meterData.account_id:", meterData.account_id)
    console.log("Debug - customerData:", customerData)
    console.log("Debug - route.params.customerData:", route.params?.customerData)

    console.log("Current form data:", {
      category: meterData.meterCategory,
      photo1: meterData.photo1 ? "Present" : "Missing",
      photo2: meterData.photo2 ? "Present" : "Missing",
      make: meterData.meterMake,
      serial: meterData.serialNumber,
      year: meterData.manufactureYear,
      reading: meterData.finalReading,
      account_id: meterData.account_id,
    })

    setIsSubmitting(true)

    try {
      // Clear previous errors
      setErrors({})
      setValidationDetails([])

      // Use enhanced validation that returns detailed information
      const { validationErrors, validationDetails } = validateAllFields()

      // Save validation details for debug display
      setValidationDetails(validationDetails)

      console.log("Validation errors:", validationErrors)
      console.log("Validation details:", validationDetails)

      // Count actual errors
      const errorCount = Object.keys(validationErrors).length

      // If there are any validation errors, show them and stop submission
      if (errorCount > 0) {
        setErrors(validationErrors)

        // Show detailed validation errors with exact reasons
        showDetailedValidationErrors(validationDetails, errorCount)

        setIsSubmitting(false)
        return
      }

      // Get current category - use state directly since we have the function now
      const currentCategory = meterData.meterCategory

      if (!currentCategory) {
        Alert.alert("Required Field", "Please select a meter category")
        setIsSubmitting(false)
        return
      }

      const accountId = meterData.account_id || customerData?.account_id || route.params?.customerData?.account_id

      console.log(
        "[v0] Account ID sources - meterData:",
        meterData.account_id,
        "customerData:",
        customerData?.account_id,
        "route.params:",
        route.params?.customerData?.account_id,
      )
      console.log("[v0] Resolved accountId:", accountId)

      if (!accountId) {
        Alert.alert("Error", "Account ID is missing. Cannot proceed.")
        setIsSubmitting(false)
        return
      }

      // Ensure we have the category in state
      if (!meterData.meterCategory) {
        const updatedData = {
          ...meterData,
          meterCategory: currentCategory,
          account_id: accountId, // Ensure account_id is set
        }
        setMeterData(updatedData)
        await saveData(updatedData)
        await saveToCache(updatedData)
      }

      const updatedMeterData = {
        ...meterData,
        meterCategory: currentCategory,
        account_id: accountId, // Ensure account_id is set
      }

      // Double check account_id
      if (!updatedMeterData.account_id) {
        console.error("Account ID is still missing after update")
        Alert.alert("Error", "Account ID is missing. Cannot save meter data to cache.")
        setIsSubmitting(false)
        return
      }

      const finalMeterDataToCache = {
        ...updatedMeterData,
        account_id: accountId,
      }

      try {
        await saveToCache(finalMeterDataToCache)
        console.log("[v0] Old meter data successfully saved to SQLite cache before submission.")
      } catch (cacheError) {
        console.error("[v0] Error saving old meter data to SQLite cache:", cacheError)
        Alert.alert("Database Error", "Failed to save meter data locally. Please try again.")
        setIsSubmitting(false)
        return
      }

      // NEW LOGIC: Handle online/offline submission
      const networkState = await NetInfo.fetch()
      const isOnlineMode = networkState.isConnected && networkState.isInternetReachable

      if (isOnlineMode) {
        console.log("[v0] Online mode - creating instance and uploading old meter data")

        try {
          // Step 1: Create server instance (only if not already created)
          if (!serverInstanceCreated) {
            console.log(`[v0] Creating server instance for account ID: ${accountId}`)
            const instanceResult = await createServerInstance(accountId)

            console.log("[v0] Server instance creation result:", instanceResult)

            if (instanceResult.isNetworkError) {
              console.error("[v0] Network error during server instance creation:", instanceResult.error)
              Alert.alert("Network Error", instanceResult.error)
              setIsSubmitting(false)
              return
            }

            console.log("[v0] Server instance assumed successful")
            setServerInstanceCreated(true)
          }

          const userId = (await AsyncStorage.getItem("userId")) || "0"

          // NEW: Handle image file preparation for upload
          let image1File = null
          let image2File = null

          // Process photo1
          if (finalMeterDataToCache.photo1) {
            if (finalMeterDataToCache.photo1.startsWith("http")) {
              console.log("[IMAGE] Photo1 is a remote URL, downloading...")
              try {
                image1File = await downloadRemoteImage(finalMeterDataToCache.photo1, "image_1_old")
              } catch (downloadError) {
                console.error("[IMAGE] Failed to download photo1:", downloadError)
                Alert.alert("Image Error", "Failed to download photo 1. Please retake the photo.")
                setIsSubmitting(false)
                return
              }
            } else {
              console.log("[IMAGE] Photo1 is a local file, creating file object...")
              try {
                image1File = await createFileObject(finalMeterDataToCache.photo1, "image_1_old")
              } catch (fileError) {
                console.error("[IMAGE] Failed to create file object for photo1:", fileError)
                Alert.alert("Image Error", "Failed to process photo 1. Please retake the photo.")
                setIsSubmitting(false)
                return
              }
            }
          }

          // Process photo2
          if (finalMeterDataToCache.photo2) {
            if (finalMeterDataToCache.photo2.startsWith("http")) {
              console.log("[IMAGE] Photo2 is a remote URL, downloading...")
              try {
                image2File = await downloadRemoteImage(finalMeterDataToCache.photo2, "image_2_old")
              } catch (downloadError) {
                console.error("[IMAGE] Failed to download photo2:", downloadError)
                Alert.alert("Image Error", "Failed to download photo 2. Please retake the photo.")
                setIsSubmitting(false)
                return
              }
            } else {
              console.log("[IMAGE] Photo2 is a local file, creating file object...")
              try {
                image2File = await createFileObject(finalMeterDataToCache.photo2, "image_2_old")
              } catch (fileError) {
                console.error("[IMAGE] Failed to create file object for photo2:", fileError)
                Alert.alert("Image Error", "Failed to process photo 2. Please retake the photo.")
                setIsSubmitting(false)
                return
              }
            }
          }

          // Prepare form data for upload - FIXED: Use proper field names
          const formData = new FormData()

          formData.append("account_id", String(accountId))
          formData.append("serial_no_old", finalMeterDataToCache.serialNumber || "")
          formData.append("mfd_year_old", finalMeterDataToCache.manufactureYear || "")
          formData.append("final_reading", finalMeterDataToCache.finalReading || "")
          formData.append("meter_make_old", finalMeterDataToCache.meterMake || "")
          formData.append(
            "category",
            finalMeterDataToCache.meterCategory === "Electromechanical" ? "EM" : finalMeterDataToCache.meterCategory,
          )
          formData.append("created_by", userId)

          console.log("[v0] FormData being sent with account_id:", String(accountId))

          // Add image files if available
          if (image1File) {
            formData.append("image_1_old", image1File)
            console.log("[UPLOAD] Added image1 file to form data")
          } else {
            console.warn("[UPLOAD] No image1 file available")
          }

          if (image2File) {
            formData.append("image_2_old", image2File)
            console.log("[UPLOAD] Added image2 file to form data")
          } else {
            console.warn("[UPLOAD] No image2 file available")
          }

          const uploadResult = await uploadOldMeterData(formData)

          console.log("[v0] Old meter upload result:", uploadResult)

          if (!uploadResult.success) {
            console.error("[v0] Failed to upload old meter data:", uploadResult.error)

            let errorMessage = "Failed to upload old meter data. Please try again."
            if (uploadResult.status === 422) {
              errorMessage = "Invalid data provided. Please check all fields and try again."
            } else if (uploadResult.status >= 500) {
              errorMessage = "Server error while uploading data. Please try again later."
            } else if (uploadResult.error) {
              errorMessage = `Upload error: ${uploadResult.error}`
            }

            Alert.alert("Upload Error", errorMessage)
            setIsSubmitting(false)
            return
          }

          console.log("[v0] Old meter data uploaded successfully to server")

          try {
            const oldMeterDataForDB = {
              account_id: accountId,
              serial_no_old: finalMeterDataToCache.serialNumber,
              mfd_year_old: finalMeterDataToCache.manufactureYear,
              final_reading: finalMeterDataToCache.finalReading,
              meter_make_old: finalMeterDataToCache.meterMake,
              category:
                finalMeterDataToCache.meterCategory === "Electromechanical"
                  ? "EM"
                  : finalMeterDataToCache.meterCategory,
              image_1_old: finalMeterDataToCache.photo1,
              image_2_old: finalMeterDataToCache.photo2,
              section_code: customerData?.section || "",
              created_by: userId,
              timestamp: new Date().toISOString(),
              is_uploaded: 1, // Mark as uploaded since it succeeded online
              is_valid: 1,
            }

            console.log("[v0] Saving uploaded old meter data to database for persistence:", oldMeterDataForDB)
            const savedId = await saveOldMeterData(oldMeterDataForDB)
            console.log("[v0] Old meter data saved to database with ID:", savedId)
          } catch (dbError) {
            console.error("[v0] Error saving old meter data to database after successful upload:", dbError)
            // Don't fail the flow, just log the error
          }

          // Clear cache after successful upload
          try {
            await saveToCache({
              ...finalMeterDataToCache,
              photo1: null,
              photo2: null,
              meterMake: "",
              serialNumber: "",
              manufactureYear: "",
              finalReading: "",
              meterCategory: "",
            })
          } catch (cacheError) {
            console.error("[v0] Error clearing cache:", cacheError)
          }

          console.log("[v0] Navigating to NewMeter screen with old meter data")
          navigation.navigate("NewMeter", {
            oldMeterData: finalMeterDataToCache,
          })
        } catch (error) {
          console.error("[v0] Exception in online mode submission:", error)
          Alert.alert("Error", `An unexpected error occurred: ${error.message || "Unknown error"}. Please try again.`)
        }
      } else {
        console.log("[v0] Offline mode - saving old meter data to database")

        try {
          const userId = (await AsyncStorage.getItem("userId")) || "0"

          const oldMeterDataForDB = {
            account_id: accountId,
            serial_no_old: finalMeterDataToCache.serialNumber,
            mfd_year_old: finalMeterDataToCache.manufactureYear,
            final_reading: finalMeterDataToCache.finalReading,
            meter_make_old: finalMeterDataToCache.meterMake,
            category:
              finalMeterDataToCache.meterCategory === "Electromechanical" ? "EM" : finalMeterDataToCache.meterCategory,
            image_1_old: finalMeterDataToCache.photo1,
            image_2_old: finalMeterDataToCache.photo2,
            section_code: customerData?.section || "",
            created_by: userId,
            timestamp: new Date().toISOString(),
            is_uploaded: 0, // Mark as not uploaded since it's offline
            is_valid: 1,
          }

          console.log("[v0] Saving old meter data to database in offline mode:", oldMeterDataForDB)
          const savedId = await saveOldMeterData(oldMeterDataForDB)

          if (savedId) {
            console.log("[v0] Old meter data saved to database with ID:", savedId)
            Alert.alert(
              "Data Saved",
              "Old meter data saved locally and will be uploaded when connection is available",
              [
                {
                  text: "OK",
                  onPress: () => {
                    navigation.navigate("NewMeter", {
                      oldMeterData: finalMeterDataToCache,
                    })
                  },
                },
              ],
            )
          } else {
            Alert.alert("Error", "Failed to save old meter data locally. Please try again.")
            setIsSubmitting(false)
            return
          }
        } catch (error) {
          console.error("[v0] Error in offline mode submission:", error)
          Alert.alert("Error", `Failed to save old meter data locally: ${error.message}. Please try again.`)
          setIsSubmitting(false)
          return
        }
      }
    } catch (error) {
      console.error("[v0] Error in handleNext:", error)
      Alert.alert("Error", `An unexpected error occurred: ${error.message || "Unknown error"}. Please try again.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderCustomerDetails = () => (
    <View style={styles.customerDetailsContainer}>
      <Text style={styles.customerDetailsTitle}>Customer Details</Text>
      {[
        { label: "Account ID", value: customerData.account_id },
        { label: "RR Number", value: customerData.rr_no },
        { label: "Name", value: customerData.consumer_name },
        { label: "Address", value: customerData.consumer_address },
        { label: "Division", value: customerData.division },
        { label: "Sub Division", value: customerData.sub_division },
        { label: "Phase Type", value: customerData.phase_type },
        ...(meterData.previousReading
          ? [
              {
                label: "Previous Reading",
                value: `${meterData.previousReading} (${meterData.previousReadingDate || "N/A"})`,
              },
            ]
          : []),
      ].map(({ label, value }) => (
        <View key={label} style={styles.customerInfoRow}>
          <Text style={styles.customerInfoLabel}>{label}:</Text>
          <Text style={styles.customerInfoValue}>{value}</Text>
        </View>
      ))}
    </View>
  )

  const renderDebugPanel = () => {
    if (!showDebugInfo) return null

    return (
      <View style={styles.debugPanel}>
        <Text style={styles.debugTitle}>Debug Info (Development Only)</Text>

        {/* Current Input Values */}
        <Text style={styles.debugSectionTitle}>Current Input Values:</Text>
        <Text style={styles.debugText}>Account ID: {meterData.account_id || "Not set"}</Text>
        <Text style={styles.debugText}>Meter Category: {meterData.meterCategory || "Not set"}</Text>
        <Text style={styles.debugText}>Meter Make: {meterData.meterMake || "Not set"}</Text>
        <Text style={styles.debugText}>Serial Number: {meterData.serialNumber || "Not set"}</Text>
        <Text style={styles.debugText}>Manufacture Year: {meterData.manufactureYear || "Not set"}</Text>
        <Text style={styles.debugText}>Final Reading: {meterData.finalReading || "Not set"}</Text>
        <Text style={styles.debugText}>Previous Reading: {meterData.previousReading || "Not set"}</Text>
        <Text style={styles.debugText}>Previous Reading Date: {meterData.previousReadingDate || "Not set"}</Text>

        {/* Validation Status */}
        {validationDetails.length > 0 && (
          <>
            <Text style={styles.debugSectionTitle}>Validation Status:</Text>
            {validationDetails.map((detail, index) => (
              <Text key={index} style={[styles.debugText, detail.error ? styles.debugError : styles.debugSuccess]}>
                {detail.status} {detail.field}: "{detail.value}"{detail.error && ` → ${detail.error}`}
              </Text>
            ))}
          </>
        )}

        {/* Image Information */}
        <Text style={styles.debugSectionTitle}>Image Information:</Text>

        {["photo1", "photo2"].map((photoKey) => {
          const info = imageInfo[photoKey]
          return (
            <View key={photoKey} style={styles.imageInfoContainer}>
              <Text style={styles.debugSubTitle}>{photoKey.toUpperCase()}:</Text>
              {info ? (
                info.exists ? (
                  <>
                    <Text style={styles.debugText}>• URI: {info.uri.substring(0, 50)}...</Text>
                    <Text style={styles.debugText}>
                      • Size: {info.sizeKB === null ? "N/A" : `${info.sizeKB} KB`} (
                      {info.sizeMB === null ? "N/A" : `${info.sizeMB} MB`})
                    </Text>
                    <Text style={styles.debugText}>
                      • Format: {info.extension} ({info.mimeType})
                    </Text>
                    <Text style={styles.debugText}>
                      • Under 2MB: {info.isUnder2MB === null ? "N/A" : info.isUnder2MB ? "✅ Yes" : "❌ No"}
                    </Text>
                    <Text style={styles.debugText}>
                      • Type: {info.isLocalFile ? "📱 Local File" : info.isRemoteUrl ? "🌐 Remote URL" : "Unknown"}
                    </Text>
                    {info.isFromServer && <Text style={styles.debugText}>• From Server: ✅ Yes</Text>}
                    <Text style={styles.debugText}>• Filename: {info.filename}</Text>
                    {info.lastModified !== "unknown" && (
                      <Text style={styles.debugText}>• Modified: {new Date(info.lastModified).toLocaleString()}</Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.debugError}>• File does not exist</Text>
                    <Text style={styles.debugText}>• URI: {info.uri}</Text>
                    {info.error && <Text style={styles.debugError}>• Error: {info.error}</Text>}
                  </>
                )
              ) : (
                <Text style={styles.debugText}>• No image set</Text>
              )}
            </View>
          )
        })}

        {/* System Information */}
        <Text style={styles.debugSectionTitle}>System Information:</Text>
        <Text style={styles.debugText}>Last Category Sent: {lastCategorySent || "none"}</Text>
        <Text style={styles.debugText}>Upload Attempts: {uploadAttempts}</Text>
        <Text style={styles.debugText}>Server Instance Created: {serverInstanceCreated ? "✅ Yes" : "❌ No"}</Text>
        <Text style={styles.debugText}>Online Status: {isOnline ? "✅ Online" : "❌ Offline"}</Text>
        <Text style={styles.debugText}>Submitting: {isSubmitting ? "🔄 Yes" : "✅ No"}</Text>

        {/* Debug Actions */}
        <Text style={styles.debugSectionTitle}>Debug Actions:</Text>
        <View style={styles.debugActionsRow}>
          <TouchableOpacity
            style={styles.debugButton}
            onPress={async () => {
              const currentCategory = await getCurrentMeterCategory()
              Alert.alert("Current Category", `From all sources: ${currentCategory || "Not found"}`)
            }}
          >
            <Text style={styles.debugButtonText}>Check Category</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => {
              setServerInstanceCreated(false)
              Alert.alert("Debug", "Server instance flag reset")
            }}
          >
            <Text style={styles.debugButtonText}>Reset Instance</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => {
              // Refresh image info
              if (meterData.photo1) getImageInfo(meterData.photo1, "photo1")
              if (meterData.photo2) getImageInfo(meterData.photo2, "photo2")
              Alert.alert("Debug", "Image info refreshed")
            }}
          >
            <Text style={styles.debugButtonText}>Refresh Images</Text>
          </TouchableOpacity>
        </View>

        {/* Test Validation */}
        <TouchableOpacity
          style={[styles.debugButton, styles.fullWidthButton]}
          onPress={() => {
            const { validationErrors, validationDetails } = validateAllFields()
            const errorCount = Object.keys(validationErrors).length
            if (errorCount > 0) {
              showDetailedValidationErrors(validationDetails, errorCount)
            } else {
              Alert.alert("Validation Test", "✅ All fields are valid!")
            }
          }}
        >
          <Text style={styles.debugButtonText}>Test Validation</Text>
        </TouchableOpacity>

        {/* Raw Data */}
        <TouchableOpacity
          style={[styles.debugButton, styles.fullWidthButton]}
          onPress={() => {
            Alert.alert("Raw Meter Data", JSON.stringify(meterData, null, 2), [{ text: "OK" }], { cancelable: true })
          }}
        >
          <Text style={styles.debugButtonText}>Show Raw Data</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const isFieldDisabled = (fieldName) => {
    return (
      meterData.meterCategory === "DC" &&
      ["meterMake", "serialNumber", "manufactureYear", "finalReading"].includes(fieldName)
    )
  }

  const isMeterMakeDisabled = () => {
    return meterData.meterCategory === "DC"
  }

  // Enhanced validation display function
  const showDetailedValidationErrors = (validationDetails, errorCount) => {
    let errorMessage = `Please fix the following ${errorCount} error${errorCount > 1 ? "s" : ""}:\n\n`

    validationDetails.forEach((detail, index) => {
      if (detail.error) {
        errorMessage += `${index + 1}. ${detail.field}\n`
        errorMessage += `   Current Value: "${detail.value}"\n`
        errorMessage += `   ❌ Error: ${detail.error}\n\n`
      }
    })

    errorMessage += "Please correct the highlighted fields and try again."

    Alert.alert(`Validation Failed (${errorCount} Error${errorCount > 1 ? "s" : ""})`, errorMessage, [
      {
        text: "Show Field Details",
        onPress: () => {
          // Show detailed field-by-field breakdown
          let fieldDetails = "FIELD VALIDATION DETAILS:\n\n"
          validationDetails.forEach((detail) => {
            fieldDetails += `${detail.status} ${detail.field}: "${detail.value}"\n`
            if (detail.error) {
              fieldDetails += `   → ${detail.error}\n`
            }
            fieldDetails += "\n"
          })

          Alert.alert("Complete Validation Report", fieldDetails, [{ text: "OK" }])
        },
      },
      {
        text: "OK",
        style: "default",
      },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <AndroidStatusBarSafeView backgroundColor="#F5F5F5">
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <AppHeader />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-undo" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Old Meter Details</Text>
          {/* <TouchableOpacity style={styles.debugToggle} onPress={() => setShowDebugInfo(!showDebugInfo)}>
            <Text style={styles.debugToggleText}>{showDebugInfo ? "🔴 Debug" : "🐛 Debug"}</Text>
          </TouchableOpacity> */}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollViewContent, { paddingBottom: keyboardVisible ? 120 : 100 }]}
          keyboardShouldPersistTaps="handled"
        >
          {renderDebugPanel()}

          <View style={styles.content}>
            {renderCustomerDetails()}

            <View style={styles.formGroup} id="meterCategory">
              <Text style={styles.label}>
                Meter Category <Text style={styles.required}>*required</Text>
              </Text>
              <View style={[styles.radioGroup, errors.meterCategory && styles.errorFieldContainer]}>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    meterData.meterCategory === "Electromechanical" && styles.radioButtonSelected,
                    errors.meterCategory && styles.errorRadioButton,
                  ]}
                  onPress={() => handleCategoryChangeAndValidate("Electromechanical")}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      meterData.meterCategory === "Electromechanical" && styles.radioCircleSelected,
                    ]}
                  />
                  <Text style={styles.radioLabel}>Electromechanical</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    meterData.meterCategory === "MNR" && styles.radioButtonSelected,
                    errors.meterCategory && styles.errorRadioButton,
                  ]}
                  onPress={() => handleCategoryChangeAndValidate("MNR")}
                >
                  <View style={[styles.radioCircle, meterData.meterCategory === "MNR" && styles.radioCircleSelected]} />
                  <Text style={styles.radioLabel}>MNR</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    meterData.meterCategory === "DC" && styles.radioButtonSelected,
                    errors.meterCategory && styles.errorRadioButton,
                  ]}
                  onPress={() => handleCategoryChangeAndValidate("DC")}
                >
                  <View style={[styles.radioCircle, meterData.meterCategory === "DC" && styles.radioCircleSelected]} />
                  <Text style={styles.radioLabel}>DC</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    meterData.meterCategory === "RNV" && styles.radioButtonSelected,
                    errors.meterCategory && styles.errorRadioButton,
                  ]}
                  onPress={() => handleCategoryChangeAndValidate("RNV")}
                >
                  <View style={[styles.radioCircle, meterData.meterCategory === "RNV" && styles.radioCircleSelected]} />
                  <Text style={styles.radioLabel}>RNV</Text>
                </TouchableOpacity>
              </View>
              {errors.meterCategory && <Text style={styles.errorText}>{errors.meterCategory}</Text>}
            </View>

            {["photo1", "photo2"].map((photoKey, index) => (
              <View key={photoKey} style={styles.formGroup} id={photoKey}>
                <Text style={styles.label}>
                  Photo {index + 1} with readings on display <Text style={styles.required}>*required</Text>
                </Text>

                <TouchableOpacity
                  style={[
                    styles.photoButton,
                    (errors[photoKey] || imageValidationErrors[photoKey]) && styles.errorPhotoButton,
                  ]}
                  onPress={() => takePhoto(photoKey)}
                >
                  <Text style={styles.photoButtonText}>{meterData[photoKey] ? "Retake Photo" : "Take Photo"}</Text>
                </TouchableOpacity>

                {processingPhoto === photoKey ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>{compressionProgress || "Processing photo..."}</Text>
                  </View>
                ) : (
                  meterData[photoKey] && (
                    <View style={styles.photoPreviewContainer}>
                      {isValidUrl(meterData[photoKey]) ? (
                        <Image
                          source={{
                            uri: meterData[photoKey],
                            cache: "force-cache",
                          }}
                          style={styles.photoPreview}
                          resizeMode="contain"
                          onError={(error) => {
                            console.error("Image loading error:", error.nativeEvent.error)
                            Alert.alert("Error", "Failed to load photo preview. Please check your internet connection.")
                          }}
                          onLoadStart={() => console.log("Starting to load image:", meterData[photoKey])}
                          onLoadEnd={() => console.log("Finished loading image")}
                        />
                      ) : (
                        <Text style={styles.invalidUrlText}>Invalid image URL: {meterData[photoKey]}</Text>
                      )}
                    </View>
                  )
                )}
                {(errors[photoKey] || imageValidationErrors[photoKey]) && (
                  <Text style={styles.errorText}>{errors[photoKey] || imageValidationErrors[photoKey]}</Text>
                )}
              </View>
            ))}

            <View style={styles.formGroup} id="meterMake">
              <MeterMakeDropdown
                label={
                  <>
                    Meter Make <Text style={styles.required}>*required</Text>
                  </>
                }
                onSelect={handleMeterMakeSelect}
                disabled={isMeterMakeDisabled()}
                value={meterData.meterMake}
                placeholder="Select Meter Make"
                error={errors.meterMake}
              />
              {errors.meterMake && <Text style={styles.errorText}>{errors.meterMake}</Text>}
            </View>

            <View style={styles.formGroup} id="serialNumber">
              <Text style={styles.label}>
                Meter Serial No <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  isFieldDisabled("serialNumber") && styles.disabledInput,
                  errors.serialNumber && styles.errorInput,
                ]}
                placeholder={
                  meterData.meterCategory === "DC"
                    ? "Serial number (any characters allowed for DC)"
                    : "Enter serial number "
                }
                value={meterData.serialNumber}
                onChangeText={handleSerialNumberChange}
                editable={!isFieldDisabled("serialNumber")}
                maxLength={meterData.meterCategory === "DC" ? undefined : 10}
              />
              {errors.serialNumber && <Text style={styles.errorText}>{errors.serialNumber}</Text>}
            </View>

            <View style={styles.formGroup} id="manufactureYear">
              <Text style={styles.label}>
                Year Of Manufacture <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  isFieldDisabled("manufactureYear") && styles.disabledInput,
                  errors.manufactureYear && styles.errorInput,
                ]}
                placeholder={
                  meterData.meterCategory === "DC" ? "Enter 0 for DC category" : "Enter manufacture year (4 digits)"
                }
                value={meterData.manufactureYear}
                onChangeText={handleManufactureYearChange}
                keyboardType="numeric"
                maxLength={meterData.meterCategory === "DC" ? undefined : 4}
                editable={!isFieldDisabled("manufactureYear")}
              />
              {errors.manufactureYear && <Text style={styles.errorText}>{errors.manufactureYear}</Text>}
            </View>

            {meterData.previousReading && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Previous Meter Reading on {meterData.previousReadingDate || "N/A"}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: "#f0f0f0" }]}
                  value={meterData.previousReading}
                  editable={false}
                />
              </View>
            )}

            <View style={styles.formGroup} id="finalReading">
              <Text style={styles.label}>
                Final Reading (FR)-kWh <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  isFieldDisabled("finalReading") && styles.disabledInput,
                  errors.finalReading && styles.errorInput,
                ]}
                placeholder={
                  meterData.meterCategory === "DC"
                    ? "Enter 0 for DC category"
                    : "Enter final reading (positive numbers only)"
                }
                value={meterData.finalReading}
                onChangeText={handleFinalReadingChange}
                keyboardType="numeric"
                editable={!isFieldDisabled("finalReading")}
              />
              {errors.finalReading && <Text style={styles.errorText}>{errors.finalReading}</Text>}

              {readingDifference !== null && meterData.previousReading && (
                <View style={styles.differenceContainer}>
                  <Text
                    style={[
                      styles.differenceText,
                      readingDifference < 0 ? styles.negativeDifference : styles.positiveDifference,
                    ]}
                  >
                    Difference: {readingDifference} kWh ({readingDifference < 0 ? "Lower" : "Higher"} than previous
                    reading)
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => navigation.goBack()}
                disabled={isSubmitting}
              >
                <Text style={styles.buttonText}>Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton, isSubmitting && styles.disabledButton]}
                onPress={handleNext}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <View style={styles.buttonSpinner}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={[styles.buttonText, { marginLeft: 8 }]}>Processing...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Next</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <Modal
          visible={showValidationModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowValidationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Are you sure you want to proceed?</Text>
              </View>
              <View style={styles.modalBody}>
                {readingDifference < 0 ? (
                  <Text style={styles.warningText}>
                    Entered FR Reading is less than Previous Meter Reading from database
                  </Text>
                ) : (
                  <Text style={styles.normalText}>
                    Entered FR Reading is greater than Previous Meter Reading from database
                  </Text>
                )}
                <Text style={readingDifference < 0 ? styles.differenceText : styles.positiveText}>
                  Difference in Meter Reading: {readingDifference}
                </Text>
              </View>
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.noButton]}
                  onPress={() => setShowValidationModal(false)}
                >
                  <Text style={styles.modalButtonText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.yesButton]}
                  onPress={() => {
                    setShowValidationModal(false)
                    handleNext()
                  }}
                >
                  <Text style={styles.modalButtonText}>Yes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </AndroidStatusBarSafeView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    width: "100%",
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollViewContent: {
    width: "100%",
    paddingBottom: 100,
  },
  header: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    flex: 1,
    textAlign: "center",
  },
  debugToggle: {
    padding: 8,
  },
  debugToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#007AFF",
  },
  networkIndicator: {
    padding: 8,
    alignItems: "center",
  },
  networkText: {
    color: "white",
    fontWeight: "600",
  },
  content: {
    padding: 16,
    width: "100%",
  },
  customerDetailsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    width: "100%",
  },
  customerDetailsTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: "#007AFF",
  },
  customerInfoRow: {
    flexDirection: "row",
    marginBottom: 8,
    width: "100%",
  },
  customerInfoLabel: {
    fontWeight: "600",
    width: "35%",
    color: "#333",
  },
  customerInfoValue: {
    flex: 1,
    color: "#333",
  },
  formGroup: {
    marginBottom: 20,
    width: "100%",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  value: {
    fontSize: 16,
    color: "#333",
  },
  required: {
    color: "red",
  },
  optional: {
    fontStyle: "italic",
    color: "#666",
  },
  input: {
    height: 40,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    width: "100%",
    backgroundColor: "#fff",
  },
  disabledInput: {
    backgroundColor: "#f0f0f0",
    color: "#666",
  },
  errorInput: {
    borderColor: "red",
    backgroundColor: "#fff5f5",
  },
  photoButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
  },
  errorPhotoButton: {
    borderColor: "red",
    borderWidth: 2,
    backgroundColor: "#fff5f5",
  },
  photoButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  photoPreviewContainer: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#f8f9fa",
    width: "100%",
  },
  photoPreview: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  photoMetadata: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#fff",
    borderRadius: 4,
  },
  metadataText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 24,
    width: "100%",
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 8,
  },
  primaryButton: {
    backgroundColor: "#007AFF",
  },
  secondaryButton: {
    backgroundColor: "#6c757d",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginTop: 12,
    width: "100%",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 8,
    width: "90%",
    maxWidth: 400,
    overflow: "hidden",
  },
  modalHeader: {
    backgroundColor: "#4285F4",
    padding: 16,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  modalBody: {
    padding: 20,
    backgroundColor: "#E3F2FD",
  },
  warningText: {
    color: "#FF0000",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  differenceText: {
    color: "#FF0000",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginLeft: 8,
  },
  noButton: {
    backgroundColor: "#6c757d",
  },
  yesButton: {
    backgroundColor: "#007AFF",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  normalText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  positiveText: {
    color: "#28a745",
    fontSize: 16,
    fontWeight: "bold",
  },
  radioGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
  },
  radioButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    minWidth: 110,
    flexGrow: 1,
  },
  radioButtonSelected: {
    borderColor: "#007AFF",
    backgroundColor: "#E3F2FD",
  },
  errorRadioButton: {
    borderColor: "red",
    backgroundColor: "#fff5f5",
  },
  radioCircle: {
    height: 20,
    width: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ccc",
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  radioCircleSelected: {
    borderColor: "#007AFF",
    backgroundColor: "#fff",
    borderWidth: 6,
  },
  radioLabel: {
    fontSize: 16,
    color: "#333",
    flexShrink: 1,
    maxWidth: 100,
  },
  errorText: {
    color: "red",
    marginTop: 5,
    fontSize: 12,
    fontWeight: "600",
  },
  invalidUrlText: {
    color: "red",
    textAlign: "center",
    padding: 10,
    fontSize: 14,
  },
  differenceContainer: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  negativeDifference: {
    color: "#dc3545",
  },
  positiveDifference: {
    color: "#28a745",
  },
  disabledButton: {
    backgroundColor: "#7fb5e6",
    opacity: 0.7,
  },
  buttonSpinner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  // Error field container
  errorFieldContainer: {
    borderColor: "red",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fff5f5",
  },
  // Enhanced Debug panel styles
  debugPanel: {
    padding: 12,
    backgroundColor: "#f8f9fa",
    borderWidth: 2,
    borderColor: "#007AFF",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  debugTitle: {
    fontWeight: "bold",
    marginBottom: 10,
    color: "#007AFF",
    fontSize: 16,
    textAlign: "center",
  },
  debugSectionTitle: {
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 4,
    color: "#333",
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 2,
  },
  debugSubTitle: {
    fontWeight: "600",
    marginTop: 4,
    color: "#555",
    fontSize: 12,
  },
  debugText: {
    color: "#333",
    fontSize: 11,
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  debugError: {
    color: "#dc3545",
    fontSize: 11,
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontWeight: "bold",
  },
  debugSuccess: {
    color: "#28a745",
    fontSize: 11,
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  imageInfoContainer: {
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  debugActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  debugButton: {
    backgroundColor: "#007AFF",
    padding: 6,
    borderRadius: 4,
    flex: 1,
    marginHorizontal: 2,
    alignItems: "center",
  },
  fullWidthButton: {
    flex: 0,
    width: "100%",
    marginTop: 8,
  },
  debugButtonText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
})

export default OldMeterScreen
