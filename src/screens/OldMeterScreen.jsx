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
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};
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
    } else if (cachedOldMeterData) {
      // Auto-populate mode: use cached data
      console.log("Auto-populating with cached old meter data")
      
      // Check if we have image URLs that need the domain prefix
      const formatImageUrl = (url) => {
        if (!url) return null;
        // If it's already a full URL, return as is
        if (url.startsWith('http')) return url;
        // If it's a path only, add the domain
        if (url.startsWith('uploads/')) {
          return `https://gescom.vishvin.com/${url}`;
        }
        return url;
      };
      
      const updatedData = {
        ...meterData,
        photo1: formatImageUrl(cachedOldMeterData.photo1),
        photo2: formatImageUrl(cachedOldMeterData.photo2),
        meterMake: cachedOldMeterData.meterMake || "",
        serialNumber: cachedOldMeterData.serialNumber || "",
        manufactureYear: cachedOldMeterData.manufactureYear || "",
        finalReading: cachedOldMeterData.finalReading || "",
        meterCategory: cachedOldMeterData.meterCategory || "",
        previousReading: cachedOldMeterData.previousReading || "",
        previousReadingDate: cachedOldMeterData.previousReadingDate || "",
      }
      setMeterData(updatedData)
      await saveToCache(updatedData)
    } else if (customerData?.account_id) {
      // Normal mode: try to load from cache first
      const cachedData = await loadFromCache(customerData.account_id)
      if (cachedData) {
        console.log("Loading existing cached data for account:", customerData.account_id)
        
        // Check if we have image URLs that need the domain prefix
        const formatImageUrl = (url) => {
          if (!url) return null;
          // If it's already a full URL, return as is
          if (url.startsWith('http')) return url;
          // If it's a path only, add the domain
          if (url.startsWith('uploads/')) {
            return `https://gescom.vishvin.com/${url}`;
          }
          return url;
        };
        
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
        meterMake: "N/A",
        serialNumber: "N/A",
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
    await saveToCache(newData) // Save to cache database immediately

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

        setCompressionProgress("Compressing image to ensure it meets size requirements...")

        try {
          const compressedUri = await compressImage(capturedPhoto.uri, 2000)
          console.log("Compressed photo URI:", compressedUri)

          await handleInputChange(photoKey, compressedUri) // This will save to both AsyncStorage and cache DB

          if (errors[photoKey]) {
            setErrors({
              ...errors,
              [photoKey]: null,
            })
          }
        } catch (compressionError) {
          console.error("Error compressing image:", compressionError)
          Alert.alert(
            "Image Processing Error",
            "Failed to process the photo. Please try again with a lower resolution photo.",
          )
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

  const validateFinalReading = (reading, isRNV) => {
    if (reading === "" || reading === null) {
      return "Final reading is required"
    }

    const numReading = Number.parseFloat(reading)

    if (isNaN(numReading)) {
      return "Final reading must be a number"
    }

    if (numReading === 0 && meterData.meterCategory === "Electromechanical") {
      return "Final reading cannot be zero for Electromechanical meters"
    }

    return null
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

  const getCurrentMeterCategory = async () => {
    if (meterData.meterCategory) {
      console.log("Using meter category from state:", meterData.meterCategory)
      return meterData.meterCategory
    }

    try {
      const savedCategory = await AsyncStorage.getItem("selectedMeterCategory")
      if (savedCategory) {
        console.log("Using meter category from AsyncStorage:", savedCategory)
        return savedCategory
      }
    } catch (error) {
      console.error("Error getting meter category from AsyncStorage:", error)
    }

    try {
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

    console.error("Could not find meter category from any source")
    return null
  }

  const handleNext = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      // Clear previous errors
      setErrors({})

      const requiredFields = ["meterMake", "serialNumber", "manufactureYear", "finalReading"]
      const missingFields = requiredFields.filter((field) => !meterData[field])

      if (!meterData.photo1 || !meterData.photo2) {
        Alert.alert("Required Photos", "Please take both photos before proceeding")
        setIsSubmitting(false)
        return
      }

      const currentCategory = await getCurrentMeterCategory()

      if (!currentCategory) {
        Alert.alert("Required Field", "Please select a meter category")
        setIsSubmitting(false)
        return
      }

      if (!meterData.meterCategory) {
        const updatedData = {
          ...meterData,
          meterCategory: currentCategory,
        }
        setMeterData(updatedData)
        await saveData(updatedData)
        await saveToCache(updatedData)
      }

      if (missingFields.length > 0) {
        Alert.alert("Required Fields", "Please fill in all required fields")
        setIsSubmitting(false)
        return
      }

      if (meterData.serialNumber && /^0+$/.test(meterData.serialNumber)) {
        Alert.alert("Invalid Serial Number", "Please enter a valid serial number.")
        setIsSubmitting(false)
        return
      }

      const isRNV = currentCategory === "RNV"
      const finalReadingError = validateFinalReading(meterData.finalReading, isRNV)

      if (finalReadingError) {
        setErrors((prev) => ({ ...prev, finalReading: finalReadingError }))
        Alert.alert("Validation Error", finalReadingError)
        setIsSubmitting(false)
        return
      }

      const updatedMeterData = {
        ...meterData,
        meterCategory: currentCategory,
      }

      if (!updatedMeterData.account_id && customerData?.account_id) {
        updatedMeterData.account_id = customerData.account_id
        setMeterData(updatedMeterData)
        await saveData(updatedMeterData)
        await saveToCache(updatedMeterData)
      }

      // Ensure account_id is present before saving to cache
      const finalMeterDataToCache = {
        ...updatedMeterData,
        account_id: updatedMeterData.account_id || customerData?.account_id,
      }

      if (!finalMeterDataToCache.account_id) {
        Alert.alert("Error", "Account ID is missing. Cannot save meter data to cache.")
        setIsSubmitting(false)
        return
      }

      // Save data to SQLite cache one final time before navigation
      try {
        await saveToCache(finalMeterDataToCache)
        console.log("Old meter data successfully saved to SQLite cache before navigation.")
      } catch (cacheError) {
        console.error("Error saving old meter data to SQLite cache:", cacheError)
        Alert.alert("Database Error", "Failed to save meter data locally. Please try again.")
        setIsSubmitting(false)
        return
      }

      // NEW LOGIC: Handle online/offline submission
      const networkState = await NetInfo.fetch()
      const isOnlineMode = networkState.isConnected && networkState.isInternetReachable

      if (isOnlineMode) {
        // ONLINE MODE: Create instance and upload old meter data
        console.log("Online mode - creating instance and uploading old meter data")

        try {
          // Step 1: Create server instance (only if not already created)
          if (!serverInstanceCreated) {
            console.log(`Creating server instance for account ID: ${finalMeterDataToCache.account_id}`)
            const instanceResult = await createServerInstance(finalMeterDataToCache.account_id)

            console.log("Server instance creation result:", instanceResult)

            // ULTRA OPTIMISTIC: Always assume success unless it's a clear network error
            if (instanceResult.isNetworkError) {
              console.error("Network error during server instance creation:", instanceResult.error)
              Alert.alert("Network Error", instanceResult.error)
              setIsSubmitting(false)
              return
            }

            // For everything else, assume success
            console.log("Server instance assumed successful (ultra optimistic approach)")
            setServerInstanceCreated(true)
          }

          // Step 2: Upload old meter data
          const userId = (await AsyncStorage.getItem("userId")) || "0"

          const oldMeterDataForUpload = {
            account_id: finalMeterDataToCache.account_id,
            serial_no_old: finalMeterDataToCache.serialNumber,
            mfd_year_old: finalMeterDataToCache.manufactureYear,
            final_reading: finalMeterDataToCache.finalReading,
            meter_make_old: finalMeterDataToCache.meterMake,
            category:
              finalMeterDataToCache.meterCategory === "Electromechanical" ? "EM" : finalMeterDataToCache.meterCategory,
            image_1_old: finalMeterDataToCache.photo1,
            image_2_old: finalMeterDataToCache.photo2,
            created_by: userId,
          }

          console.log("Uploading old meter data:", oldMeterDataForUpload)
          const uploadResult = await uploadOldMeterData(oldMeterDataForUpload)

          console.log("Old meter upload result:", uploadResult)

          if (!uploadResult.success) {
            console.error("Failed to upload old meter data:", uploadResult.error)
            console.error("Upload result details:", {
              error: uploadResult.error,
              status: uploadResult.status,
              data: uploadResult.data,
            })

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

          console.log("Old meter data uploaded successfully")

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
            console.error("Error clearing cache:", cacheError)
          }

          // Navigate to NewMeterScreen on success
          navigation.navigate("NewMeter", {
            oldMeterData: finalMeterDataToCache,
          })
        } catch (error) {
          console.error("Exception in online mode submission:", error)
          Alert.alert("Error", `An unexpected error occurred: ${error.message || "Unknown error"}. Please try again.`)
        }
      } else {
        // OFFLINE MODE: Save to database
        console.log("Offline mode - saving old meter data to database")

        try {
          const userId = (await AsyncStorage.getItem("userId")) || "0"

          const oldMeterDataForDB = {
            account_id: finalMeterDataToCache.account_id,
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
            is_uploaded: 0,
            is_valid: 1,
          }

          console.log("Saving old meter data to database:", oldMeterDataForDB)
          const savedId = await saveOldMeterData(oldMeterDataForDB)

          if (savedId) {
            console.log("Old meter data saved to database with ID:", savedId)
            Alert.alert("Data Saved", "Old meter data saved locally", [
              {
                text: "OK",
                onPress: () => {
                  // Navigate to NewMeterScreen
                  navigation.navigate("NewMeter", {
                    oldMeterData: finalMeterDataToCache,
                  })
                },
              },
            ])
          } else {
            Alert.alert("Error", "Failed to save old meter data locally. Please try again.")
            setIsSubmitting(false)
            return
          }
        } catch (error) {
          console.error("Error in offline mode submission:", error)
          Alert.alert("Error", `Failed to save old meter data locally: ${error.message}. Please try again.`)
          setIsSubmitting(false)
          return
        }
      }
    } catch (error) {
      console.error("Error in handleNext:", error)
      Alert.alert("Error", `An unexpected error occurred: ${error.message || "Unknown error"}. Please try again.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFinalReadingChange = async (value) => {
    await handleInputChange("finalReading", value)
    const isRNV = meterData.meterCategory === "RNV"
    const error = validateFinalReading(value, isRNV)
    setErrors((prev) => ({ ...prev, finalReading: error }))

    if (meterData.previousReading && value) {
      const finalReading = Number.parseFloat(value)
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
    const isNonElectromechanical = category === "RNV" || category === "MNR" || category === "DC"
    const error = validateFinalReading(meterData.finalReading, isNonElectromechanical)
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
        <Text style={styles.debugText}>Current Category: {meterData.meterCategory || "none"}</Text>
        <Text style={styles.debugText}>Last Category Sent: {lastCategorySent || "none"}</Text>
        <Text style={styles.debugText}>Upload Attempts: {uploadAttempts}</Text>
        <Text style={styles.debugText}>Server Instance Created: {serverInstanceCreated ? "Yes" : "No"}</Text>
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
          <Text style={styles.debugButtonText}>Reset Instance Flag</Text>
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
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollViewContent, { paddingBottom: keyboardVisible ? 120 : 100 }]}
          keyboardShouldPersistTaps="handled"
        >
          {renderDebugPanel()}

          <View style={styles.content}>
            {renderCustomerDetails()}

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Meter Category <Text style={styles.required}>*required</Text>
              </Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    meterData.meterCategory === "Electromechanical" && styles.radioButtonSelected,
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
                  style={[styles.radioButton, meterData.meterCategory === "MNR" && styles.radioButtonSelected]}
                  onPress={() => handleCategoryChangeAndValidate("MNR")}
                >
                  <View style={[styles.radioCircle, meterData.meterCategory === "MNR" && styles.radioCircleSelected]} />
                  <Text style={styles.radioLabel}>MNR</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioButton, meterData.meterCategory === "DC" && styles.radioButtonSelected]}
                  onPress={() => handleCategoryChangeAndValidate("DC")}
                >
                  <View style={[styles.radioCircle, meterData.meterCategory === "DC" && styles.radioCircleSelected]} />
                  <Text style={styles.radioLabel}>DC</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioButton, meterData.meterCategory === "RNV" && styles.radioButtonSelected]}
                  onPress={() => handleCategoryChangeAndValidate("RNV")}
                >
                  <View style={[styles.radioCircle, meterData.meterCategory === "RNV" && styles.radioCircleSelected]} />
                  <Text style={styles.radioLabel}>RNV</Text>
                </TouchableOpacity>
              </View>
            </View>

            {["photo1", "photo2"].map((photoKey, index) => (
  <View key={photoKey} style={styles.formGroup}>
    <Text style={styles.label}>
      Photo {index + 1} with readings on display <Text style={styles.required}>*required</Text>
    </Text>

    <TouchableOpacity style={styles.photoButton} onPress={() => takePhoto(photoKey)}>
      <Text style={styles.photoButtonText}>
        {meterData[photoKey] ? "Retake Photo" : "Take Photo"}
      </Text>
    </TouchableOpacity>

    {processingPhoto === photoKey ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>
          {compressionProgress || "Processing photo..."}
        </Text>
      </View>
    ) : (
      meterData[photoKey] && (
        <View style={styles.photoPreviewContainer}>
          {isValidUrl(meterData[photoKey]) ? (
            <Image
              source={{ 
                uri: meterData[photoKey],
                cache: 'force-cache'
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
            <Text style={styles.invalidUrlText}>
              Invalid image URL: {meterData[photoKey]}
            </Text>
          )}
        </View>
      )
    )}
  </View>
))}


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
            />

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Meter Serial No <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput
                style={[styles.input, isFieldDisabled("serialNumber") && styles.disabledInput]}
                placeholder="Enter serial number"
                value={meterData.serialNumber}
                onChangeText={(text) => handleInputChange("serialNumber", text)}
                editable={!isFieldDisabled("serialNumber")}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Year Of Manufacture <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput
                style={[styles.input, isFieldDisabled("manufactureYear") && styles.disabledInput]}
                placeholder="Enter manufacture year"
                value={meterData.manufactureYear}
                onChangeText={(text) => handleInputChange("manufactureYear", text)}
                keyboardType="numeric"
                maxLength={4}
                editable={!isFieldDisabled("manufactureYear")}
              />
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

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Final Reading (FR)-kWh <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput
                style={[styles.input, isFieldDisabled("finalReading") && styles.disabledInput]}
                placeholder="Enter final reading"
                value={meterData.finalReading}
                onChangeText={(text) => handleFinalReadingChange(text)}
                keyboardType="numeric"
                editable={!isFieldDisabled("finalReading")}
              />
              {errors.finalReading ? <Text style={styles.errorText}>{errors.finalReading}</Text> : null}

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

// Update styles to ensure proper spacing with keyboard
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
    paddingBottom: 100, // Add padding at the bottom to ensure content is not covered by buttons and tab bar
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
  photoButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
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
    marginBottom: 24, // Increased bottom margin
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
  },
  invalidUrlText: {
  color: 'red',
  textAlign: 'center',
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
  // Debug panel styles
  debugPanel: {
    padding: 10,
    backgroundColor: "#ffe8e8",
    borderWidth: 1,
    borderColor: "#ff8080",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  debugTitle: {
    fontWeight: "bold",
    marginBottom: 5,
    color: "#c00000",
  },
  debugText: {
    color: "#333",
    fontSize: 12,
    marginBottom: 3,
  },
  debugButton: {
    backgroundColor: "#c00000",
    padding: 5,
    borderRadius: 4,
    marginTop: 5,
    alignItems: "center",
  },
  debugButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
})

export default OldMeterScreen
