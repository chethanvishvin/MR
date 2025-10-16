"use client"

import { useState, useRef, useEffect } from "react"
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
  Keyboard,
  ActivityIndicator,
  BackHandler,
  Platform,
  PermissionsAndroid,
  TouchableWithoutFeedback,
  ToastAndroid,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import Icon from "react-native-vector-icons/Ionicons"
import { launchCamera } from "react-native-image-picker"
import NetInfo from "@react-native-community/netinfo"
import { validateMeterSerialNumber } from "../utils/apiService"
import AsyncStorage from "@react-native-async-storage/async-storage"
import Geolocation from "@react-native-community/geolocation"
import { uploadNewMeterData } from "../utils/apiService"
import { compressImage } from "../utils/imageUtils"
import { syncMeterSerialNumbers } from "../utils/syncService"
import { saveNewMeterData } from "../utils/databaseUtils"
import AndroidStatusBarSafeView from "../components/AndroidStatusBarSafeView"
import AppHeader from "../components/AppHeader"
import { clearOldMeterCache } from "../database/oldMeterCacheDB"

const { width } = Dimensions.get("window")

const NewMeterScreen = ({ route }) => {
  const { oldMeterData, editMode, failedUploadId, existingNewMeterData } = route.params || {}

  const navigation = useNavigation()
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [serialNumberReadOnly, setSerialNumberReadOnly] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isValidSerialNumber, setIsValidSerialNumber] = useState(false)
  const [isInvalidSerialNumber, setIsInvalidSerialNumber] = useState(false)
  const [errors, setErrors] = useState({})
  const [isOnline, setIsOnline] = useState(true)
  const [localSerialNumbers, setLocalSerialNumbers] = useState([])
  const [permissionsGranted, setPermissionsGranted] = useState(false)
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const serialInputRef = useRef(null)
  const scrollViewRef = useRef(null)
  const isMounted = useRef(true)
  const [processingPhoto, setProcessingPhoto] = useState(null)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [customerData, setCustomerData] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState(null)
  const [syncInterval, setSyncInterval] = useState(null)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [syncStatus, setSyncStatus] = useState("idle")

  // Enhanced location state variables
  const [location, setLocation] = useState(null)
  const [isCapturingLocation, setIsCapturingLocation] = useState(false)
  const [locationError, setLocationError] = useState(null)
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const MAX_LOCATION_ATTEMPTS = 3

  const [showDebugModal, setShowDebugModal] = useState(false)
  const [debugData, setDebugData] = useState(null)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)

  const [meterData, setMeterData] = useState({
    accountId: oldMeterData?.account_id,
    rrNumber: oldMeterData?.rr_no,
    consumerName: oldMeterData?.consumer_name,
    consumerAddress: oldMeterData?.consumer_address,
    section: oldMeterData?.section,
    subdivision: oldMeterData?.sub_division,
    photo1: editMode && existingNewMeterData?.photo1 ? existingNewMeterData.photo1 : null,
    photo2: editMode && existingNewMeterData?.photo2 ? existingNewMeterData.photo2 : null,
    meterMake: "Linkwell",
    serialNumber: editMode && existingNewMeterData?.serialNumber ? existingNewMeterData.serialNumber : "",
    manufactureYear: editMode && existingNewMeterData?.manufactureYear ? existingNewMeterData.manufactureYear : "2025",
    initialReading: "0",
    phaseType: oldMeterData?.phase_type,
  })

  useEffect(() => {
    if (oldMeterData && oldMeterData.account_id) {
      setMeterData((prevData) => ({
        ...prevData,
        accountId: oldMeterData.account_id,
      }))
      console.log("Set account_id in NewMeterScreen from oldMeterData:", oldMeterData.account_id)

      AsyncStorage.setItem(
        "newMeterData",
        JSON.stringify({
          ...meterData,
          accountId: oldMeterData.account_id,
        }),
      )
    } else {
      const getCustomerData = async () => {
        try {
          const customerDataStr = await AsyncStorage.getItem("selectedCustomer")
          if (customerDataStr) {
            const customerData = JSON.parse(customerDataStr)
            if (customerData && customerData.account_id) {
              console.log("Set account_id in NewMeterScreen from selectedCustomer:", customerData.account_id)
              setMeterData((prevData) => ({
                ...prevData,
                accountId: customerData.account_id,
              }))

              AsyncStorage.setItem(
                "newMeterData",
                JSON.stringify({
                  ...meterData,
                  accountId: customerData.account_id,
                }),
              )
            }
          }
        } catch (e) {
          console.error("Failed to retrieve account_id from selectedCustomer:", e)
        }
      }

      getCustomerData()
    }
  }, [oldMeterData])

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true)
    })
    const keyboardDidHideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false)
    })

    if (editMode && existingNewMeterData) {
      setSearchQuery(existingNewMeterData.serialNumber || "")

      if (existingNewMeterData.serialNumber) {
        setIsValidSerialNumber(true)
        setSerialNumberReadOnly(true)
      }

      setMeterData((prevData) => ({
        ...prevData,
        accountId: oldMeterData?.account_id,
        rrNumber: oldMeterData?.rr_no || "",
        consumerName: oldMeterData?.consumer_name || "",
        consumerAddress: oldMeterData?.consumer_address || "",
        section: oldMeterData?.section || "",
        subdivision: oldMeterData?.sub_division || "",
        phaseType: oldMeterData?.phase_type || "",
        meterType: "Electromechanical",
        photo1: existingNewMeterData.photo1 || null,
        photo2: existingNewMeterData.photo2 || null,
        meterMake: "Linkwell",
        sealNumber: existingNewMeterData.sealNumber || "",
        serialNumber: existingNewMeterData.serialNumber || "",
        manufactureYear: existingNewMeterData.manufactureYear || "2025",
        initialReading: "0",
      }))
    }

    checkNetworkStatus()
    checkCameraPermissions()
    checkLocationPermission()

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (isMounted.current) {
        setIsOnline(state.isConnected && state.isInternetReachable)
      }
    })

    const keyboardShowListener = Keyboard.addListener("keyboardDidShow", () => {
      if (searchResults.length > 0 && !serialNumberReadOnly && isMounted.current) {
        setShowDropdown(true)
      }
    })

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      return false
    })

    return () => {
      isMounted.current = false
      unsubscribe()
      keyboardShowListener.remove()
      keyboardDidShowListener.remove()
      keyboardDidHideListener.remove()
      backHandler.remove()
    }
  }, [])

  useEffect(() => {
    const startAutoSync = () => {
      const interval = setInterval(async () => {
        if (isOnline) {
          setSyncStatus("syncing")
          try {
            const result = await syncMeterSerialNumbers(false, false)
            if (result.success) {
              setSyncStatus("success")
              setLastSyncTime(new Date())
            } else {
              setSyncStatus("error")
            }
          } catch (error) {
            console.error("Auto sync error:", error)
            setSyncStatus("error")
          }
        }
      }, 10000)

      setSyncInterval(interval)
      return interval
    }

    if (isOnline) {
      startAutoSync()
      syncMeterSerialNumbers(false, false)
    }

    return () => {
      if (syncInterval) {
        clearInterval(syncInterval)
      }
    }
  }, [isOnline])

  const checkNetworkStatus = async () => {
    try {
      const state = await NetInfo.fetch()
      if (isMounted.current) {
        setIsOnline(state.isConnected && state.isInternetReachable)
      }
    } catch (error) {
      console.error("Error checking network status:", error)
      if (isMounted.current) {
        setIsOnline(false)
      }
    }
  }

  const checkCameraPermissions = async () => {
    setIsCheckingPermissions(true)
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
        if (granted) {
          setPermissionsGranted(true)
        } else {
          const result = await requestCameraPermission()
          setPermissionsGranted(result)
        }
      } else {
        setPermissionsGranted(true)
      }
    } catch (error) {
      console.error("Error checking camera permissions:", error)
      setPermissionsGranted(false)
    } finally {
      setIsCheckingPermissions(false)
    }
  }

  // ENHANCED LOCATION FUNCTIONS START
  const checkLocationPermission = async () => {
    try {
      // Check if we have permission
      const hasPermission = await new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          () => resolve(true),
          (error) => {
            if (error.code === 1) {
              setLocationError("Location permission required. Tap 'Get Location' to enable.")
            }
            resolve(false)
          },
          { enableHighAccuracy: false, timeout: 5000 },
        )
      })
      setLocationPermissionGranted(hasPermission)
      return hasPermission
    } catch (error) {
      console.error("Error checking location permission:", error)
      return false
    }
  }

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
          title: "Location Permission",
          message: "This app needs access to your location to record meter installation location.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK",
        })
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location permission granted")
          setLocationPermissionGranted(true)
          return true
        } else {
          console.log("Location permission denied")
          setLocationError("Location permission denied. Please enable location services to continue.")
          return false
        }
      } else {
        // For iOS, we assume permission is granted through Info.plist
        setLocationPermissionGranted(true)
        return true
      }
    } catch (err) {
      console.warn("Error requesting location permission:", err)
      setLocationError("Error requesting location permission: " + err.message)
      return false
    }
  }

  const requestLocationWithOneClick = async () => {
    setIsCapturingLocation(true)
    setLocationError(null)
    // First try with high accuracy but shorter timeout for faster response
    await getLocationWithSettings({
      enableHighAccuracy: false, // Set to false for faster response
      timeout: 10000, // Reduced timeout
      maximumAge: 60000, // Accept location up to 1 minute old
      showLocationDialog: true,
    })
  }

  const getLocationWithSettings = (options) => {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (position) => {
          console.log("Position obtained:", position)
          setLocation({
            latitude: position.coords.latitude.toString(),
            longitude: position.coords.longitude.toString(),
            accuracy: position.coords.accuracy ? position.coords.accuracy.toString() : "unknown",
          })
          setIsCapturingLocation(false)
          setLocationError(null)
          setRetryCount(0)
          resolve(true)
        },
        (error) => {
          console.error("Error getting location:", error)
          setIsCapturingLocation(false)
          if (error.code === 1) {
            // PERMISSION_DENIED
            Alert.alert("Location Permission Required", "This app needs location permission to work properly.", [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Open Settings",
                onPress: () => {
                  Linking.openSettings().catch(() => {
                    Alert.alert("Unable to open settings")
                  })
                },
              },
            ])
            setLocationError("Location permission denied. Please enable in settings.")
            resolve(false)
          } else if (error.code === 2) {
            // POSITION_UNAVAILABLE
            Alert.alert("Location Services Disabled", "Please enable location services on your device.", [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Open Settings",
                onPress: () => {
                  if (Platform.OS === "android") {
                    Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS").catch(() => {
                      Linking.openSettings().catch(() => {
                        Alert.alert("Unable to open location settings")
                      })
                    })
                  } else {
                    Linking.openURL("App-Prefs:Privacy&path=LOCATION").catch(() => {
                      Alert.alert("Unable to open location settings")
                    })
                  }
                },
              },
            ])
            setLocationError("Location services disabled. Please enable in device settings.")
            resolve(false)
          } else if (error.code === 3) {
            // TIMEOUT
            handleLocationTimeout()
            resolve(false)
          } else {
            setLocationError("Failed to get location. Please try again.")
            resolve(false)
          }
        },
        options,
      )
    })
  }

  const handleLocationTimeout = async () => {
    if (retryCount < 2) {
      // Try with different settings
      const newRetryCount = retryCount + 1
      setRetryCount(newRetryCount)
      setLocationError(`Trying again (attempt ${newRetryCount + 1}/3)...`)
      await getLocationWithSettings({
        enableHighAccuracy: false, // Keep false for faster response
        timeout: 8000, // Even shorter timeout
        maximumAge: 120000, // Accept older location data
        showLocationDialog: false,
      })
    } else {
      setLocationError("Location request timed out. Please ensure you're outdoors with clear sky view.")
    }
  }

  const captureLocation = () => {
    requestLocationWithOneClick()
  }
  // ENHANCED LOCATION FUNCTIONS END

  const requestCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: "Camera Permission",
        message: "This app needs access to your camera to take photos of meters.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      })

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        return true
      } else {
        if (isMounted.current) {
          setTimeout(() => {
            Alert.alert(
              "Camera Permission Required",
              "This app needs camera access to take photos of meters. Please grant camera permission in your device settings.",
              [{ text: "OK" }],
            )
          }, 500)
        }
        return false
      }
    } catch (err) {
      console.warn("Error requesting camera permission:", err)
      return false
    }
  }

  const handleBarcodeScan = (event) => {
    if (event.nativeEvent.codeStringValue) {
      const scannedValue = event.nativeEvent.codeStringValue.trim()
      console.log("Barcode scanned:", scannedValue)

      const numericValue = scannedValue.replace(/[^0-9]/g, "")

      if (numericValue !== scannedValue) {
        console.log("Barcode contained non-numeric characters, filtered to:", numericValue)
      }

      if (numericValue.length < 5) {
        console.log("Scanned barcode too short after filtering:", numericValue)
        Alert.alert(
          "Invalid Barcode",
          "The scanned barcode doesn't appear to be a valid meter serial number (too short).",
          [{ text: "OK" }],
        )
        return
      }

      setShowBarcodeScanner(false)
      setSearchQuery(numericValue)
      handleInputChange("serialNumber", numericValue)

      try {
        searchMeterSerialNumbers(numericValue)
      } catch (error) {
        console.error("Error validating scanned serial number:", error)
        setIsValidSerialNumber(false)
        setIsInvalidSerialNumber(true)
        setValidationError("Error validating serial number: " + error.message)
      }
    } else {
      console.log("No barcode value detected")
      Alert.alert("Scan Failed", "No barcode was detected. Please try again.", [{ text: "OK" }])
    }
  }

  const searchMeterSerialNumbers = async (query) => {
    if (query.length < 5) {
      setSearchResults([])
      setShowDropdown(false)
      setIsValidSerialNumber(false)
      setIsInvalidSerialNumber(false)
      setValidationError(null)
      return
    }

    setIsSearching(true)
    setIsInvalidSerialNumber(false)
    setValidationError(null)

    try {
      const networkState = await NetInfo.fetch()

      if (!networkState.isConnected || !networkState.isInternetReachable) {
        console.log(`Validating serial number offline: ${query}`)

        try {
          const { isValidMeterSerialNumber } = require("../utils/databaseUtils")
          const isValid = await isValidMeterSerialNumber(query)

          if (isValid) {
            setIsValidSerialNumber(true)
            setIsInvalidSerialNumber(false)
            setSearchResults([query])
            setShowDropdown(true)
            setValidationError(null)

            if (errors.serialNumber) {
              setErrors({
                ...errors,
                serialNumber: null,
              })
            }
          } else {
            setSearchResults([])
            setShowDropdown(false)
            setIsValidSerialNumber(false)
            setIsInvalidSerialNumber(true)
            setValidationError("Serial number not found in offline database")
          }
        } catch (dbError) {
          console.error("Error checking local database:", dbError)
          setSearchResults([])
          setShowDropdown(false)
          setIsValidSerialNumber(false)
          setIsInvalidSerialNumber(true)
          setValidationError("Error validating serial number offline")
        }

        setIsSearching(false)
        return
      }

      console.log(`Validating serial number online: ${query}`)
      const result = await validateMeterSerialNumber(query)
      console.log("Validation result:", JSON.stringify(result, null, 2))

      if (result.success) {
        if (isMounted.current) {
          setIsValidSerialNumber(true)
          setIsInvalidSerialNumber(false)
          setSearchResults([query])
          setShowDropdown(true)
          setValidationError(null)

          if (errors.serialNumber) {
            setErrors({
              ...errors,
              serialNumber: null,
            })
          }
        }
      } else {
        if (result.status === 404) {
          setSearchResults([])
          setShowDropdown(false)
          setIsValidSerialNumber(false)
          setIsInvalidSerialNumber(true)
          setValidationError(`Serial number not found. Please check and try again.`)
        } else {
          if (isMounted.current) {
            setSearchResults([])
            setShowDropdown(false)
            setIsValidSerialNumber(false)
            setIsInvalidSerialNumber(true)
            setValidationError(result.error || "Invalid serial number")
          }
        }
      }
    } catch (error) {
      console.error("Error searching meter serial numbers:", error)

      if (isMounted.current) {
        setSearchResults([])
        setShowDropdown(false)
        setIsValidSerialNumber(false)
        setIsInvalidSerialNumber(true)
        setValidationError(`Error: ${error.message || "Unknown error validating serial number"}`)
      }
    } finally {
      if (isMounted.current) {
        setIsSearching(false)
      }
    }
  }

  const handleSerialNumberChange = (text) => {
    const numericText = text.replace(/[^0-9]/g, "")
    setSearchQuery(numericText)
    handleInputChange("serialNumber", numericText)

    setIsValidSerialNumber(false)
    setIsInvalidSerialNumber(false)
    setValidationError(null)

    if (numericText.length >= 5) {
      searchMeterSerialNumbers(numericText)
    } else {
      setShowDropdown(false)
      setSearchResults([])
    }
  }

  const handleSelectSerialNumber = (serialNumber) => {
    handleInputChange("serialNumber", serialNumber)
    setSearchQuery(serialNumber)
    setShowDropdown(false)
    setSerialNumberReadOnly(true)
    setIsValidSerialNumber(true)
    setIsInvalidSerialNumber(false)
    setValidationError(null)
    Keyboard.dismiss()
  }

  const handleInputChange = (key, value) => {
    if (key === "initialReading") {
      const numericValue = String(value)
        .replace(/[^0-9.]/g, "")
        .trim()

      setMeterData((prev) => ({
        ...prev,
        [key]: numericValue,
      }))
    } else {
      setMeterData((prev) => ({
        ...prev,
        [key]: value,
      }))
    }

    if (errors[key]) {
      setErrors({
        ...errors,
        [key]: null,
      })
    }
  }

  // UPDATED TAKE PHOTO FUNCTION
  const takePhoto = async (photoKey) => {
    if (!permissionsGranted) {
      const granted = await requestCameraPermission()
      if (!granted) return
      setPermissionsGranted(granted)
    }

    const options = {
      mediaType: "photo",
      quality: 0.8,
      maxWidth: 1200,
      maxHeight: 1200,
      saveToPhotos: false,
      includeBase64: false,
    }

    try {
      setProcessingPhoto(photoKey)
      const response = await launchCamera(options)

      if (response.didCancel) {
        setProcessingPhoto(null)
        return
      }

      if (response.errorCode) {
        Alert.alert("Error", "Failed to capture photo. Please try again.")
        setProcessingPhoto(null)
        return
      }

      if (response.assets && response.assets.length > 0) {
        const capturedPhoto = response.assets[0]
        setCompressionProgress("Compressing image...")

        try {
          const compressedUri = await compressImage(capturedPhoto.uri, 2000)
          handleInputChange(photoKey, compressedUri)

          if (errors[photoKey]) {
            setErrors({
              ...errors,
              [photoKey]: null,
            })
          }
        } catch (compressionError) {
          Alert.alert(
            "Image Processing Error",
            "Failed to process the photo. Please try again with a lower resolution photo.",
          )
        } finally {
          setCompressionProgress(null)
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to take photo. Please try again.")
    } finally {
      setProcessingPhoto(null)
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!meterData.serialNumber) newErrors.serialNumber = "Serial number is required"
    if (!isValidSerialNumber) newErrors.serialNumber = "Please enter a valid serial number"
    if (!meterData.initialReading) newErrors.initialReading = "Initial reading is required"
    if (!meterData.photo1) newErrors.photo1 = "Photo 1 is required"
    if (!meterData.photo2) newErrors.photo2 = "Photo 2 is required"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // MODIFIED HANDLE SUBMIT WITH IMPROVED LOCATION HANDLING
  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert("Required Fields", "Please fill in all required fields and take both photos")
      return
    }

    // Validate location
    if (!location) {
      Alert.alert("Location Required", "Please capture your current location before submitting")
      return
    }

    setIsSubmitting(true)

    // 1. Check location permission first
    let locationPermissionGranted = await checkLocationPermission()
    if (!locationPermissionGranted) {
      locationPermissionGranted = await requestLocationPermission()
      if (!locationPermissionGranted) {
        Alert.alert(
          "Location Permission Required",
          "This app needs location access to record installation locations.",
          [
            { text: "Cancel", onPress: () => setIsSubmitting(false) },
            {
              text: "Open Settings",
              onPress: () => {
                Linking.openSettings()
                setIsSubmitting(false)
              },
            },
          ],
        )
        return
      }
    }

    // Continue with the rest of the submission
    try {
      const finalAccountId = meterData.accountId || oldMeterData?.account_id
      if (!finalAccountId) {
        console.error("Cannot submit: account_id is missing")
        Alert.alert("Error", "Account ID is missing. Please go back and try again.")
        setIsSubmitting(false)
        return
      }
      const userId = (await AsyncStorage.getItem("userId")) || "0"
      const networkState = await NetInfo.fetch()
      const isOnlineMode = networkState.isConnected && networkState.isInternetReachable

      if (isOnlineMode) {
        // Online mode submission logic...
        console.log("Online mode - uploading new meter data")

        try {
          const newMeterDataForUpload = {
            account_id: finalAccountId,
            meter_make_new: meterData.meterMake,
            serial_no_new: meterData.serialNumber,
            mfd_year_new: meterData.manufactureYear,
            initial_reading_kwh: meterData.initialReading,
            initial_reading_kvah: meterData.initialReading,
            image_1_new: meterData.photo1,
            image_2_new: meterData.photo2,
            lat: location.latitude,
            lon: location.longitude,
            created_by: userId,
          }

          console.log("Uploading new meter data:", newMeterDataForUpload)
          const uploadResult = await uploadNewMeterData(newMeterDataForUpload)

          if (!uploadResult.success) {
            console.error("Failed to upload new meter data:", uploadResult.error)

            // Save to database for retry
            const newMeterDataForDB = {
              account_id: finalAccountId,
              meter_make_new: meterData.meterMake,
              serial_no_new: meterData.serialNumber,
              mfd_year_new: meterData.manufactureYear,
              initial_reading: meterData.initialReading,
              initial_reading_kwh: meterData.initialReading,
              initial_reading_kvah: meterData.initialReading,
              image_1_new: meterData.photo1,
              image_2_new: meterData.photo2,
              section_code: oldMeterData?.section || "",
              lat: location.latitude,
              lon: location.longitude,
              created_by: userId,
              timestamp: new Date().toISOString(),
              is_uploaded: 0,
              is_valid: 0,
              upload_error: uploadResult.error || "Network error during upload",
            }

            try {
              await saveNewMeterData(newMeterDataForDB)
              Alert.alert(
                "Upload Failed - Saved for Retry",
                "Failed to upload data but it has been saved locally and will be retried when connection is available.",
                [
                  {
                    text: "OK",
                    onPress: () => {
                      navigation.reset({
                        index: 0,
                        routes: [
                          {
                            name: "MainTabs",
                            params: { screen: "Home" },
                          },
                        ],
                      })
                    },
                  },
                ],
              )
            } catch (saveError) {
              console.error("Error saving failed upload data:", saveError)
              Alert.alert("Error", "Failed to save data for retry: " + saveError.message)
            }

            setIsSubmitting(false)
            return
          }

          console.log("New meter data uploaded successfully")

          try {
            console.log(`Clearing old meter cache for account_id: ${finalAccountId}`)
            await clearOldMeterCache(finalAccountId)
            console.log("Old meter cache cleared successfully")
          } catch (cacheError) {
            console.error("Error clearing old meter cache:", cacheError)
          }

          await AsyncStorage.removeItem("oldMeterData")
          await AsyncStorage.removeItem("newMeterData")
          await AsyncStorage.removeItem("selectedCustomer")

          Alert.alert(
            "Success",
            "New meter data uploaded successfully",
            [
              {
                text: "OK",
                onPress: () => {
                  navigation.reset({
                    index: 0,
                    routes: [
                      {
                        name: "MainTabs",
                        params: { screen: "Home" },
                      },
                    ],
                  })
                },
              },
            ],
            { cancelable: false },
          )
        } catch (uploadError) {
          console.error("Error during new meter upload:", uploadError)
          Alert.alert("Error", "Failed to upload new meter data: " + uploadError.message)
          setIsSubmitting(false)
          return
        }
      } else {
        // Offline mode submission logic...
        console.log("Offline mode - saving new meter data to database")

        try {
          const newMeterDataForDB = {
            account_id: finalAccountId,
            meter_make_new: meterData.meterMake,
            serial_no_new: meterData.serialNumber,
            mfd_year_new: meterData.manufactureYear,
            initial_reading: meterData.initialReading,
            initial_reading_kwh: meterData.initialReading,
            initial_reading_kvah: meterData.initialReading,
            image_1_new: meterData.photo1,
            image_2_new: meterData.photo2,
            section_code: oldMeterData?.section || "",
            lat: location.latitude,
            lon: location.longitude,
            created_by: userId,
            timestamp: new Date().toISOString(),
            is_uploaded: 0,
            is_valid: 1,
          }

          console.log("Saving new meter data to database:", newMeterDataForDB)
          const newMeterId = await saveNewMeterData(newMeterDataForDB)

          if (newMeterId) {
            console.log("New meter data saved to database with ID:", newMeterId)

            try {
              console.log(`Clearing old meter cache for account_id: ${finalAccountId}`)
              await clearOldMeterCache(finalAccountId)
              console.log("Old meter cache cleared successfully")
            } catch (cacheError) {
              console.error("Error clearing old meter cache:", cacheError)
            }

            await AsyncStorage.removeItem("oldMeterData")
            await AsyncStorage.removeItem("newMeterData")
            await AsyncStorage.removeItem("selectedCustomer")

            Alert.alert(
              "Data Saved Offline",
              "Your new meter data has been saved locally and will be uploaded when internet connection is available.",
              [
                {
                  text: "OK",
                  onPress: () => {
                    navigation.reset({
                      index: 0,
                      routes: [
                        {
                          name: "MainTabs",
                          params: { screen: "Home" },
                        },
                      ],
                    })
                  },
                },
              ],
              { cancelable: false },
            )
          } else {
            Alert.alert("Error", "Failed to save new meter data locally. Please try again.")
            setIsSubmitting(false)
            return
          }
        } catch (error) {
          console.error("Error in offline mode submission:", error)
          Alert.alert("Error", "Failed to save new meter data locally. Please try again.")
          setIsSubmitting(false)
          return
        }
      }
    } catch (error) {
      console.error("Error in handleSubmit:", error)
      Alert.alert("Error", "An unexpected error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const clearSerialNumber = () => {
    setSearchQuery("")
    handleInputChange("serialNumber", "")
    setIsValidSerialNumber(false)
    setIsInvalidSerialNumber(false)
    setValidationError(null)
    setSerialNumberReadOnly(false)
    setShowDropdown(false)
    setSearchResults([])

    setTimeout(() => {
      serialInputRef.current?.focus()
    }, 100)
  }

  const handlePrevious = () => {
    navigation.goBack()
  }

  const renderDropdown = () => {
    if (!showDropdown || searchResults.length === 0) return null

    return (
      <View style={styles.dropdownContainer}>
        {searchResults.map((item, index) => (
          <TouchableOpacity
            key={index.toString()}
            style={styles.dropdownItem}
            onPress={() => handleSelectSerialNumber(item)}
          >
            <Text style={styles.dropdownItemText}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>
    )
  }

  const renderPhotoSection = (photoKey, index) => (
    <View key={photoKey} style={styles.formGroup}>
      <Text style={styles.label}>
        Photo {index + 1} with readings on display <Text style={styles.required}>*required</Text>
      </Text>
      <TouchableOpacity
        style={[
          styles.photoButton,
          errors[photoKey] && styles.errorInput,
          isCheckingPermissions && styles.disabledButton,
        ]}
        onPress={() => takePhoto(photoKey)}
        disabled={isCheckingPermissions}
      >
        <Icon name="camera-outline" size={20} color="#007AFF" style={styles.buttonIcon} />
        <Text style={styles.photoButtonText}>
          {isCheckingPermissions ? "Checking permissions..." : meterData[photoKey] ? "Retake Photo" : "Take Photo"}
        </Text>
      </TouchableOpacity>
      {errors[photoKey] && <Text style={styles.errorText}>{errors[photoKey]}</Text>}
      {processingPhoto === photoKey ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{compressionProgress || "Processing photo..."}</Text>
        </View>
      ) : (
        meterData[photoKey] && (
          <View style={styles.photoPreviewContainer}>
            <Image source={{ uri: meterData[photoKey] }} style={styles.photoPreview} resizeMode="contain" />
          </View>
        )
      )}
    </View>
  )

  const renderConsumerDetails = () => (
    <View style={styles.customerDetailsContainer}>
      <Text style={styles.customerDetailsTitle}>Consumer Details</Text>
      {[
        { label: "Account ID", value: meterData.accountId },
        { label: "RR Number", value: meterData.rrNumber },
        { label: "Name", value: meterData.consumerName },
        { label: "Address", value: meterData.consumerAddress },
        { label: "Section", value: meterData.section },
        { label: "Subdivision", value: meterData.subdivision },
        { label: "Phase Type", value: meterData.phaseType },
      ].map(({ label, value }) => (
        <View key={label} style={styles.customerInfoRow}>
          <Text style={styles.customerInfoLabel}>{label}:</Text>
          <Text style={styles.customerInfoValue}>{value}</Text>
        </View>
      ))}
    </View>
  )

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
          <TouchableOpacity onPress={handlePrevious} style={styles.backButton}>
            <Icon name="arrow-undo" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Meter Details</Text>
        </View>
{/* 
        <View
          style={[
            styles.locationIndicator,
            {
              backgroundColor: location ? "#28a745" : "#ffc107",
              opacity: isCapturingLocation ? 0.7 : 1,
            },
          ]}
        >
          <Text style={styles.locationText}>
            {isCapturingLocation
              ? "Getting Location..."
              : location
                ? `Location: ±${location.accuracy}m`
                : "Location Required"}
          </Text>
        </View> */}

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollViewContent, { paddingBottom: keyboardVisible ? 120 : 100 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {renderConsumerDetails()}
            {renderPhotoSection("photo1", 0)}
            {renderPhotoSection("photo2", 1)}

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Meter Make <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput style={[styles.input, { backgroundColor: "#e0e0e0" }]} value="Linkwell" editable={false} />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Meter Serial No <Text style={styles.required}>*required</Text>
              </Text>
              <View style={styles.searchContainer}>
                <TouchableWithoutFeedback
                  onLongPress={() => {
                    if (serialNumberReadOnly) {
                      setSerialNumberReadOnly(false)
                      setIsValidSerialNumber(false)
                      setIsInvalidSerialNumber(false)
                      setValidationError(null)
                      setSearchQuery("")
                      handleInputChange("serialNumber", "")
                      setTimeout(() => {
                        serialInputRef.current?.focus()
                      }, 100)
                      if (Platform.OS === "android") {
                        ToastAndroid.show("Serial number field is now editable", ToastAndroid.SHORT)
                      }
                    }
                  }}
                >
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                    <TextInput
                      ref={serialInputRef}
                      style={[
                        styles.input,
                        { flex: 1 },
                        serialNumberReadOnly && { backgroundColor: "#e0e0e0" },
                        isValidSerialNumber && { borderColor: "#28a745" },
                        isInvalidSerialNumber && { borderColor: "#dc3545" },
                        errors.serialNumber && styles.errorInput,
                      ]}
                      placeholder="Enter serial number (min 5 digits)"
                      value={searchQuery}
                      onChangeText={handleSerialNumberChange}
                      keyboardType="numeric"
                      maxLength={12}
                      editable={!serialNumberReadOnly}
                      onFocus={() => {
                        if (searchResults.length > 0 && !serialNumberReadOnly) {
                          setShowDropdown(true)
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (meterData.serialNumber && isValidSerialNumber) {
                            setSerialNumberReadOnly(true)
                          }
                          setShowDropdown(false)
                        }, 200)
                      }}
                    />

                    {isSearching ? (
                      <ActivityIndicator size="small" color="#007AFF" style={styles.validationIcon} />
                    ) : isValidSerialNumber ? (
                      <Icon name="checkmark-circle" size={20} color="#28a745" style={styles.validationIcon} />
                    ) : isInvalidSerialNumber ? (
                      <Icon name="close-circle" size={20} color="#dc3545" style={styles.validationIcon} />
                    ) : searchQuery.length > 0 ? (
                      <TouchableOpacity style={styles.clearIcon} onPress={clearSerialNumber}>
                        <Icon name="close-circle" size={20} color="#dc3545" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </TouchableWithoutFeedback>
              </View>

              {renderDropdown()}

              {errors.serialNumber && <Text style={styles.errorText}>{errors.serialNumber}</Text>}
              {validationError && <Text style={styles.errorText}>{validationError}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Year Of Manufacture <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: "#e0e0e0" }]}
                placeholder="Enter Year"
                value={meterData.manufactureYear}
                onChangeText={(text) => handleInputChange("manufactureYear", text)}
                editable={false}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Initial Reading (IR)-kWh <Text style={styles.required}>*required</Text>
              </Text>
              <TextInput style={[styles.input, { backgroundColor: "#e0e0e0" }]} value="0" editable={false} />
            </View>

            {/* ENHANCED LOCATION UI */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Location <Text style={styles.required}>*required</Text>
              </Text>
              <View style={styles.locationContainer}>
                <View style={styles.locationHeaderContainer}>
                  <Text style={styles.locationSubLabel}>Current Location:</Text>
                  <TouchableOpacity
                    style={styles.getLocationButton}
                    onPress={captureLocation}
                    disabled={isCapturingLocation}
                  >
                    <Text style={styles.getLocationButtonText}>
                      {isCapturingLocation ? "Getting..." : location ? "Refresh Location" : "Get Location"}
                    </Text>
                    <Icon name="location" size={16} color="#FFFFFF" style={styles.locationIcon} />
                  </TouchableOpacity>
                </View>
                {isCapturingLocation ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={styles.loadingText}>Getting your location...</Text>
                  </View>
                ) : locationError ? (
                  <View style={styles.errorContainer}>
                    <Icon name="alert-circle-outline" size={20} color="#FF3B30" style={styles.errorIcon} />
                    <Text style={styles.errorText}>{locationError}</Text>
                  </View>
                ) : location ? (
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationText}>Latitude: {location.latitude}</Text>
                    <Text style={styles.locationText}>Longitude: {location.longitude}</Text>
                    {/* <Text style={styles.locationText}>Accuracy: {location.accuracy} meters</Text> */}
                    <Text style={styles.locationSuccessText}>✓ Location successfully obtained</Text>
                  </View>
                ) : (
                  <Text style={styles.locationText}>Tap "Get Location" to obtain your current location</Text>
                )}
              </View>
            </View>

            <View style={styles.navigationButtons}>
              <TouchableOpacity style={[styles.navButton, styles.previousButton]} onPress={handlePrevious}>
                <Text style={styles.navButtonText}>Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navButton, styles.nextButton, isSubmitting && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <View style={styles.buttonSpinner}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={[styles.navButtonText, { marginLeft: 8 }]}>
                      {isCapturingLocation ? "Getting Location..." : "Submitting..."}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.navButtonText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </AndroidStatusBarSafeView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    width: "100%",
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    width: "100%",
  },
  scrollViewContent: {
    width: "100%",
    paddingBottom: 100,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    width: "100%",
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
  locationIndicator: {
    padding: 8,
    alignItems: "center",
  },
  locationText: {
     color: "black",
    fontWeight: "600",
    fontSize: 12,
  },
  content: {
    flex: 1,
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
    marginBottom: 16,
    width: "100%",
  },
  label: {
    fontSize: 16,
    color: "#333",
    marginBottom: 8,
  },
  required: {
    color: "#dc3545",
    fontStyle: "italic",
  },
  input: {
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#000",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    width: "100%",
  },
  errorInput: {
    borderColor: "#dc3545",
  },
  errorText: {
    color: "#dc3545",
    fontSize: 12,
    marginTop: 4,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    padding: 12,
    justifyContent: "center",
    width: "100%",
  },
  disabledButton: {
    backgroundColor: "#cccccc",
    borderColor: "#cccccc",
  },
  buttonIcon: {
    marginRight: 8,
  },
  photoButtonText: {
    color: "#007AFF",
    fontSize: 16,
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginTop: 8,
    resizeMode: "contain",
  },
  photoPreviewContainer: {
    marginTop: 8,
    width: "100%",
  },
  navigationButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 32,
    width: "100%",
  },
  navButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
  },
  previousButton: {
    backgroundColor: "#6c757d",
  },
  nextButton: {
    backgroundColor: "#007AFF",
  },
  navButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonSpinner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    position: "relative",
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  dropdownContainer: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: "#fff",
    zIndex: 2,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: "100%",
  },
  validationIcon: {
    position: "absolute",
    right: 16,
    top: 14,
  },
  clearIcon: {
    position: "absolute",
    right: 16,
    top: 14,
    padding: 4,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  dropdownItemText: {
    fontSize: 16,
    color: "#333",
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
  // Enhanced location styles
  locationContainer: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 16,
    width: "100%",
  },
  locationHeaderContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    width: "100%",
  },
  locationSubLabel: {
    fontSize: 14,
    color: "#666666",
  },
  getLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  getLocationButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginRight: 4,
  },
  locationIcon: {
    marginLeft: 2,
  },
  locationInfo: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
  },
  locationSuccessText: {
    fontSize: 14,
    color: "#34C759",
    marginTop: 8,
    fontWeight: "500",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    padding: 10,
    borderRadius: 6,
    marginVertical: 8,
    width: "100%",
  },
  errorIcon: {
    marginRight: 8,
  },
})

export default NewMeterScreen
