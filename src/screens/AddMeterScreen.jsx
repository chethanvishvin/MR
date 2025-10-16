"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  BackHandler,
  Modal,
  ToastAndroid,
  Platform,
  InteractionManager,
  TextInput,
  FlatList,
} from "react-native"
import Footer from "../components/Footer"

import Geolocation from "@react-native-community/geolocation"
import Icon from "react-native-vector-icons/Ionicons"
import axios from "axios"
import AsyncStorage from "@react-native-async-storage/async-storage"
import NetInfo from "@react-native-community/netinfo"
import { insertCustomerData, getCustomersBySection, clearCustomerData, initDatabase } from "../database/database"
import { initializeBackgroundServices } from "../utils/backgroundService"
import { uploadPendingData } from "../utils/apiService"
import { syncMeterSerialNumbers } from "../utils/syncService"
import AndroidStatusBarSafeView from "../components/AndroidStatusBarSafeView"
import AppHeader from "../components/AppHeader"
const BASE_URL = "https://gescom.vishvin.com/mobile-app/api"
const CHUNK_SIZE = 1000 // Reduced chunk size for better reliability

const AddMeterScreen = ({ navigation }) => {
  const [sectionCodes, setSectionCodes] = useState([])
  const [filteredSectionCodes, setFilteredSectionCodes] = useState([])
  const [selectedSectionCode, setSelectedSectionCode] = useState("")
  const [fetchingCodes, setFetchingCodes] = useState(true)
  const [fetchingCustomers, setFetchingCustomers] = useState(false)
  const [customersLoaded, setCustomersLoaded] = useState(false)
  const [customerCount, setCustomerCount] = useState(0)
  const [errorCount, setErrorCount] = useState(0)
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [showRetryModal, setShowRetryModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [isLocked, setIsLocked] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const processingRef = useRef(false)
  const abortControllerRef = useRef(null)
  const processingCancelRef = useRef(false)
  const [successCount, setSuccessCount] = useState(0)
  const [errors, setErrors] = useState(0)
  const unsubscribeRef = useRef(null)
  const backgroundServicesCleanup = useRef(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isMeterSyncing, setIsMeterSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [lastMeterSyncTime, setLastMeterSyncTime] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState("") // New state for connection status

  // Search functionality states
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const handleAutomaticSync = async () => {
    if (isSyncing) return

    setIsSyncing(true)
    console.log("Starting automatic data upload...")

    try {
      // Sync pending data (old meter and new meter)
      const result = await uploadPendingData()

      if (result.success) {
        const totalUploaded = result.oldMeterUploaded + result.newMeterUploaded
        if (totalUploaded > 0) {
          console.log(`Automatically uploaded ${totalUploaded} records`)
          showToast(`✅ Synced ${totalUploaded} records automatically`)
          setLastSyncTime(new Date())
        }
      }
    } catch (error) {
      console.error("Error during automatic data sync:", error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleAutomaticMeterSync = async () => {
    if (isMeterSyncing) return

    setIsMeterSyncing(true)
    console.log("Starting automatic meter serial sync...")

    try {
      // Sync meter serial numbers
      const meterSyncResult = await syncMeterSerialNumbers(false, false) // Silent sync

      if (meterSyncResult.success && !meterSyncResult.skipped) {
        console.log("Meter serial numbers synced successfully")
        setLastMeterSyncTime(new Date())
      }
    } catch (error) {
      console.error("Error during automatic meter sync:", error)
    } finally {
      setIsMeterSyncing(false)
    }
  }

  useEffect(() => {
    initDatabase()
      .then(() => {
        console.log("Database initialized successfully")
        checkNetworkStatus()

        const unsubscribe = NetInfo.addEventListener((state) => {
          const wasOnline = isOnline
          const nowOnline = state.isConnected && state.isInternetReachable
          setIsOnline(nowOnline)

          // If we just came online, trigger automatic sync
          if (!wasOnline && nowOnline) {
            console.log("Internet connection restored, triggering automatic sync...")
            handleAutomaticSync()
            handleAutomaticMeterSync()
          }
        })
        unsubscribeRef.current = unsubscribe

        // Initialize background services for automatic data upload (3 min) and meter sync (5 sec)
        backgroundServicesCleanup.current = initializeBackgroundServices()

        loadSavedSectionCode()
        fetchSectionCodes()
        requestLocationPermission()
      })
      .catch((error) => {
        console.error("Failed to initialize database:", error)
        Alert.alert("Database Error", "Failed to initialize database. Please restart the app.")
      })

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      navigation.navigate("Home")
      return true
    })

    return () => {
      backHandler.remove()
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
      if (backgroundServicesCleanup.current) {
        backgroundServicesCleanup.current()
      }
      // Cancel any ongoing processing when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      processingCancelRef.current = true
    }
  }, [])

  const loadSavedSectionCode = async () => {
    try {
      const savedSectionCode = await AsyncStorage.getItem("selectedSectionCode")
      const savedLockStatus = await AsyncStorage.getItem("sectionCodeLocked")

      if (savedSectionCode) {
        const parsedSectionCode = JSON.parse(savedSectionCode)
        setSelectedSectionCode(parsedSectionCode)

        if (savedLockStatus === "true") {
          setIsLocked(true)
          const customers = await getCustomersBySection(parsedSectionCode.so_code)
          if (customers && customers.length > 0) {
            setCustomerCount(customers.length)
            setCustomersLoaded(true)
            setOfflineReady(true)
            console.log(`Loaded existing section data: ${parsedSectionCode.so_code} with ${customers.length} customers`)
          }
        }
      }
    } catch (error) {
      console.error("Error loading saved section code:", error)
    }
  }

  const checkNetworkStatus = async () => {
    try {
      const state = await NetInfo.fetch()
      setIsOnline(state.isConnected && state.isInternetReachable)
    } catch (error) {
      console.error("Error checking network status:", error)
      setIsOnline(false)
    }
  }

  const requestLocationPermission = async () => {
    try {
      await new Promise((resolve, reject) => {
        Geolocation.requestAuthorization(
          () => resolve(true),
          (error) => reject(error),
        )
      })
    } catch (error) {
      console.log("Location permission request error:", error)
    }
  }

  const fetchSectionCodes = async () => {
    setFetchingCodes(true)
    try {
      const cachedCodes = await AsyncStorage.getItem("sectionCodes")

      if (cachedCodes && !isOnline) {
        const codes = JSON.parse(cachedCodes)
        setSectionCodes(codes)
        setFilteredSectionCodes(codes)
        setFetchingCodes(false)
        return
      }

      if (!isOnline) {
        Alert.alert("Offline Mode", "You are currently offline. Please connect to the internet to fetch section codes.")
        setFetchingCodes(false)
        return
      }

      const response = await axios.get(`${BASE_URL}/section_codes`)

      if (response.data && response.data.status === "success" && Array.isArray(response.data.data)) {
        const formattedData = response.data.data.map((item) => ({
          ...item,
          value: item.so_code,
          label: `${item.so_code} - ${item.sub_division}`,
        }))

        setSectionCodes(formattedData)
        setFilteredSectionCodes(formattedData)
        await AsyncStorage.setItem("sectionCodes", JSON.stringify(formattedData))
      } else {
        throw new Error("Invalid response format")
      }
    } catch (error) {
      console.error("Error fetching section codes:", error)
      try {
        const cachedCodes = await AsyncStorage.getItem("sectionCodes")
        if (cachedCodes) {
          const codes = JSON.parse(cachedCodes)
          setSectionCodes(codes)
          setFilteredSectionCodes(codes)
          showToast("Using cached section codes")
        } else {
          Alert.alert("Error", "Failed to fetch section codes and no cached data available.")
        }
      } catch (cacheError) {
        Alert.alert("Error", "Failed to fetch section codes. Please check your network connection.")
      }
    } finally {
      setFetchingCodes(false)
    }
  }

  const showToast = (message) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT)
    }
  }

  const isValidCustomer = (customer, index) => {
    if (!customer || typeof customer !== "object") {
      console.warn(`Customer at index ${index} is ${customer === null ? "null" : typeof customer}:`, customer)
      return false
    }

    const requiredFields = ["id", "account_id"]
    for (const field of requiredFields) {
      if (!customer[field] && customer[field] !== 0) {
        console.warn(`Customer at index ${index} missing required field '${field}':`, customer)
        return false
      }
    }

    if (typeof customer.id !== "number" && typeof customer.id !== "string") {
      console.warn(`Customer at index ${index} has invalid id type:`, typeof customer.id, customer)
      return false
    }

    if (typeof customer.account_id !== "string" && typeof customer.account_id !== "number") {
      console.warn(`Customer at index ${index} has invalid account_id type:`, typeof customer.account_id, customer)
      return false
    }

    return true
  }

  const processCustomersInBackground = async (customers, sectionCode) => {
    if (processingRef.current) {
      console.log("Already processing customers, skipping")
      return
    }

    processingRef.current = true
    processingCancelRef.current = false
    setTotalCustomers(customers.length)
    setCustomerCount(0)
    setErrorCount(0)
    setSuccessCount(0)
    setErrors(0)

    showToast(`Processing ${customers.length} customers in background`)

    const chunks = []
    for (let i = 0; i < customers.length; i += CHUNK_SIZE) {
      chunks.push(customers.slice(i, i + CHUNK_SIZE))
    }

    let processedCount = 0
    let currentSuccessCount = 0
    let currentErrors = 0

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      // Check if processing was cancelled
      if (processingCancelRef.current) {
        console.log("Processing cancelled, stopping background processing")
        break
      }

      const chunk = chunks[chunkIndex]

      await new Promise((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          // Double check cancellation before processing chunk
          if (processingCancelRef.current) {
            resolve()
            return
          }

          Promise.all(
            chunk.map((customer, index) => {
              if (!customer) {
                console.warn(`Skipping null/undefined customer at index ${index} in chunk ${chunkIndex}`)
                currentErrors++
                return Promise.resolve(false)
              }

              const safeCustomer = {
                ...customer,
                previous_final_reading: customer.previous_final_reading?.toString() || "0",
                billed_date: customer.billed_date?.toString() || "0",
              }

              return insertCustomerData(safeCustomer)
                .then(() => {
                  currentSuccessCount++
                  return true
                })
                .catch((error) => {
                  console.error(`Error inserting customer in chunk ${chunkIndex}:`, error?.message || "Unknown error")
                  currentErrors++
                  return false
                })
            }),
          )
            .then(() => {
              // Check cancellation before updating UI
              if (processingCancelRef.current) {
                resolve()
                return
              }

              processedCount += chunk.length
              setCustomerCount(currentSuccessCount)
              setErrorCount(currentErrors)
              setSuccessCount(currentSuccessCount)
              setErrors(currentErrors)

              if (chunkIndex % 5 === 0 || chunkIndex === chunks.length - 1) {
                console.log(`Processing chunk ${chunkIndex + 1}/${chunks.length} for section ${sectionCode}`)
              }

              resolve()
            })
            .catch((error) => {
              console.error(`Error processing chunk ${chunkIndex}:`, error?.message || "Unknown error")
              resolve()
            })
        })
      })
    }

    // Only update final states if processing wasn't cancelled
    if (!processingCancelRef.current) {
      setCustomerCount(currentSuccessCount)
      setErrorCount(currentErrors)
      setCustomersLoaded(true)
      setOfflineReady(currentSuccessCount > 0)
      await AsyncStorage.setItem("offlineDataReady", currentSuccessCount > 0 ? "true" : "false")
      showToast(`✅ Ready for offline use: ${currentSuccessCount} customers stored (${currentErrors} errors)`)
    } else {
      console.log("Processing was cancelled, not updating final states")
      showToast("Processing cancelled - section code changed")
    }

    processingRef.current = false
    processingCancelRef.current = false
  }

  const cancelOngoingProcessing = async () => {
    console.log("Cancelling ongoing processing...")

    // Cancel network request if ongoing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Cancel background processing
    processingCancelRef.current = true

    // Wait a bit for processing to stop
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Clear existing customer data
    try {
      await clearCustomerData()
      console.log("Cleared existing customer data due to section change")
    } catch (error) {
      console.error("Error clearing customer data:", error)
    }

    // Reset processing states
    processingRef.current = false
    setFetchingCustomers(false)
    setCustomersLoaded(false)
    setCustomerCount(0)
    setErrorCount(0)
    setTotalCustomers(0)
    setOfflineReady(false)
    setConnectionStatus("")
  }

  const fetchSectionCustomers = useCallback(
    async (sectionCode) => {
      if (fetchingCustomers) return

      setFetchingCustomers(true)
      setOfflineReady(false)
      setConnectionStatus("Connecting to server...")

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController()

      try {
        if (!isOnline) {
          setConnectionStatus("Checking local database...")
          const localCustomers = await getCustomersBySection(sectionCode.so_code)

          if (localCustomers && localCustomers.length > 0) {
            setCustomerCount(localCustomers.length)
            setCustomersLoaded(true)
            setOfflineReady(true)
            setConnectionStatus("")
            showToast(`Loaded ${localCustomers.length} customers from local database`)
            return localCustomers.length
          } else {
            throw new Error("No local data available for this section code")
          }
        }

        console.log("Fetching customers for section:", sectionCode)
        showToast("Connecting to server...")

        // Run the network request in the background
        InteractionManager.runAfterInteractions(async () => {
          try {
            setConnectionStatus("Fetching customer data...")
            const response = await axios.get(`${BASE_URL}/section/fetch`, {
              params: {
                so_pincode: String(sectionCode.so_code),
              },
              timeout: 30000,
              headers: {
                Accept: "application/json",
              },
              signal: abortControllerRef.current?.signal, // Add abort signal
            })

            console.log("API Response:", {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              config: response.config,
              data: response.data,
            })

            if (response.data && response.data.status === true) {
              const rawCustomers = response.data.data || []
              console.log(`Received ${rawCustomers.length} customer records from server`)

              const validCustomers = rawCustomers.filter((customer, index) => {
                return isValidCustomer(customer, index)
              })

              console.log(`Filtered to ${validCustomers.length} valid customers out of ${rawCustomers.length} total`)

              if (validCustomers.length === 0) {
                console.warn("No valid customers found in the response")
                setCustomerCount(0)
                setCustomersLoaded(true)
                setConnectionStatus("")
                return 0
              }

              try {
                setConnectionStatus("Clearing existing data...")
                await clearCustomerData()
                console.log("Cleared existing customer data")
              } catch (clearError) {
                console.error("Error clearing customer data:", clearError)
              }

              setConnectionStatus("Processing data in background...")
              processCustomersInBackground(validCustomers, sectionCode.so_code) // Pass section code

              return validCustomers.length
            } else {
              console.error("Invalid response format:", response.data)
              throw new Error("Invalid response format from server")
            }
          } catch (error) {
            // Don't show error if request was aborted (section code changed)
            if (error.name === "AbortError" || error.code === "ERR_CANCELED") {
              console.log("Request was cancelled due to section code change")
              return
            }

            console.error("Error in background fetch:", error.response ? error.response.data : error.message)
            setConnectionStatus("")

            let errorMsg = "Failed to fetch customers"
            if (error.response) {
              errorMsg = `Server error: ${error.response.status} - ${error.response.data?.message || "Unknown error"}`
            } else if (error.request) {
              errorMsg = `Network error: ${error.message || "No response from server"}`
            } else {
              errorMsg = `Error: ${error.message || "Failed to fetch customers"}`
            }

            setErrorMessage(errorMsg)
            setShowRetryModal(true)
            return 0
          } finally {
            setFetchingCustomers(false)
            setConnectionStatus("")
            abortControllerRef.current = null
          }
        })
      } catch (error) {
        console.error("Error in fetchSectionCustomers:", error)
        setFetchingCustomers(false)
        setConnectionStatus("")
        setErrorMessage(error.message || "Failed to fetch customers")
        setShowRetryModal(true)
        abortControllerRef.current = null
        return 0
      }
    },
    [isOnline, successCount, errors],
  )

  // Search functionality
  const handleSearch = (query) => {
    setSearchQuery(query)
    if (query.trim() === "") {
      setFilteredSectionCodes(sectionCodes)
    } else {
      const filtered = sectionCodes.filter(
        (item) =>
          item.so_code.toLowerCase().includes(query.toLowerCase()) ||
          item.sub_division.toLowerCase().includes(query.toLowerCase()),
      )
      setFilteredSectionCodes(filtered)
    }
  }

  const handleSelectSectionCode = async (value) => {
    if (isLocked) {
      showToast("Section code is locked. Unlock it first to change.")
      return
    }

    if (selectedSectionCode && customersLoaded && selectedSectionCode !== value) {
      Alert.alert(
        "Change Section Code?",
        "You've already loaded customer data for the current section. Changing the section code will require loading new data. Are you sure you want to continue?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Change",
            onPress: async () => {
              // Cancel any ongoing processing first
              await cancelOngoingProcessing()

              // Set the selected section code immediately
              setSelectedSectionCode(value)
              await AsyncStorage.setItem("selectedSectionCode", JSON.stringify(value))

              // Start fetching customers and auto-lock when processing begins
              await fetchSectionCustomers(value)

              // Auto-lock after starting the fetch process
              setIsLocked(true)
              await AsyncStorage.setItem("sectionCodeLocked", "true")
              showToast("Section code locked automatically")

              setShowSearchModal(false)
            },
          },
        ],
      )
    } else {
      // If there's ongoing processing for any section, cancel it first
      if (processingRef.current || fetchingCustomers) {
        await cancelOngoingProcessing()
      }

      // Set the selected section code immediately
      setSelectedSectionCode(value)
      await AsyncStorage.setItem("selectedSectionCode", JSON.stringify(value))

      if (value) {
        // Start fetching customers and auto-lock when processing begins
        await fetchSectionCustomers(value)

        // Auto-lock after starting the fetch process
        setIsLocked(true)
        await AsyncStorage.setItem("sectionCodeLocked", "true")
        showToast("Section code locked automatically")
      }
      setShowSearchModal(false)
    }
  }

  const toggleLock = async () => {
    const newLockState = !isLocked
    setIsLocked(newLockState)
    await AsyncStorage.setItem("sectionCodeLocked", newLockState.toString())
    showToast(newLockState ? "Section code locked" : "Section code unlocked")
  }

  const handleRetry = async () => {
    setShowRetryModal(false)
    await checkNetworkStatus()
    if (selectedSectionCode) {
      await fetchSectionCustomers(selectedSectionCode)
    }
  }

  const handleNext = () => {
    if (!selectedSectionCode || selectedSectionCode === "") {
      Alert.alert("Error", "Please select a section code")
      return
    }

    if (fetchingCustomers) {
      Alert.alert("Please Wait", "Customer data is still loading")
      return
    }

    if (!isLocked) {
      setIsLocked(true)
      AsyncStorage.setItem("sectionCodeLocked", "true")
    }

    navigation.navigate("CustomerSearch", {
      sectionCode: selectedSectionCode.so_code,
    })
  }

  const handlePrevious = () => {
    navigation.navigate("Home")
  }

  const getDropdownPlaceholder = () => {
    if (selectedSectionCode) {
      return `${selectedSectionCode.so_code} - ${selectedSectionCode.sub_division}`
    }
    return "Select section code"
  }

  const renderSectionItem = ({ item }) => (
    <TouchableOpacity style={styles.sectionItem} onPress={() => handleSelectSectionCode(item)}>
      <Text style={styles.sectionItemText}>{item.label}</Text>
    </TouchableOpacity>
  )

  return (
    <AndroidStatusBarSafeView backgroundColor="#F5F5F5">
      <AppHeader />
      <ScrollView style={styles.container}>
        {(lastSyncTime || lastMeterSyncTime) && (
          <View style={styles.syncStatusContainer}>
            {lastSyncTime && (
              <View style={styles.lastSyncContainer}>
                <Icon name="cloud-upload" size={16} color="#4CAF50" />
                <Text style={styles.lastSyncText}>Data sync: {lastSyncTime.toLocaleTimeString()}</Text>
              </View>
            )}
            {lastMeterSyncTime && (
              <View style={styles.lastSyncContainer}>
                <Icon name="hardware-chip" size={16} color="#2196F3" />
                <Text style={styles.lastSyncText}>Meter sync: {lastMeterSyncTime.toLocaleTimeString()}</Text>
              </View>
            )}
            <View style={styles.syncIntervalInfo}>
              <Text style={styles.syncIntervalText}>Auto-sync: Data every 3min • Meters every 5sec</Text>
            </View>
          </View>
        )}

        <View style={styles.infoContainer}>
          <Icon name="information-circle-outline" size={24} color="#007AFF" style={styles.icon} />
          <Text style={styles.infoText}>
            Select a section code from the dropdown below. You can search by typing the section code or subdivision
            name. Customer data will be automatically loaded in the background. Once loaded, tap 'Next' to proceed with
            adding a new meter.
          </Text>
        </View>

        <View style={styles.sectionCodeContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>Section Code:</Text>

            <TouchableOpacity
              style={[styles.lockButton, isLocked ? styles.lockedButton : styles.unlockedButton]}
              onPress={toggleLock}
            >
              <Icon name={isLocked ? "lock-closed" : "lock-open"} size={16} color="#FFFFFF" />
              <Text style={styles.lockButtonText}>{isLocked ? "Locked" : "Unlocked"}</Text>
            </TouchableOpacity>
          </View>

          {fetchingCodes ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Loading section codes...</Text>
            </View>
          ) : (
            <View style={styles.dropdownContainer}>
              {selectedSectionCode && (
                <View style={styles.currentSectionIndicator}>
                  <Icon name="location" size={16} color="#4CAF50" />
                  <Text style={styles.currentSectionText}>
                    Selected: {selectedSectionCode.so_code} - {selectedSectionCode.sub_division}
                    {customersLoaded && ` (${customerCount} customers loaded)`}
                  </Text>
                </View>
              )}

              {/* Searchable Dropdown Button */}
              <TouchableOpacity
                style={styles.searchableDropdown}
                onPress={() => setShowSearchModal(true)}
                disabled={fetchingCustomers || isLocked}
              >
                <Text style={[styles.dropdownText, !selectedSectionCode && styles.placeholderText]}>
                  {getDropdownPlaceholder()}
                </Text>
                <Icon name="search" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          )}

          {selectedSectionCode && (
            <View style={styles.statusContainer}>
              {connectionStatus ? (
                <View style={styles.loadingStatusContainer}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.loadingText}>{connectionStatus}</Text>
                </View>
              ) : processingRef.current ? (
                <View style={styles.processingContainer}>
                  <Text style={styles.processingText}>
                    Processing data in background: {customerCount}/{totalCustomers} stored
                    {errorCount > 0 ? ` (${errorCount} errors)` : ""}
                  </Text>
                </View>
              ) : customersLoaded ? (
                <View style={styles.successContainer}>
                  <Icon
                    name={offlineReady ? "checkmark-circle" : "alert-circle"}
                    size={20}
                    color={offlineReady ? "#4CAF50" : "#FF9800"}
                  />
                  <Text style={[styles.successText, !offlineReady && { color: "#FF9800" }]}>
                    {customerCount > 0
                      ? `${offlineReady ? "✅ Ready for offline use" : "Processing complete"}: ${customerCount} customers stored${errorCount > 0 ? ` (${errorCount} errors)` : ""}`
                      : "No customers found for this section code"}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.previousButton} onPress={handlePrevious}>
            <Icon name="arrow-back" size={24} color="#FFFFFF" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextButton, (!selectedSectionCode || fetchingCustomers) && styles.disabledButton]}
            onPress={handleNext}
            disabled={!selectedSectionCode || fetchingCustomers}
          >
            <Text style={styles.buttonText}>Next</Text>
            <Icon name="arrow-forward" size={24} color="#FFFFFF" style={styles.buttonIcon} />
          </TouchableOpacity>
        </View>

        {/* Search Modal */}
        <Modal
          visible={showSearchModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowSearchModal(false)}
        >
          <View style={styles.searchModalOverlay}>
            <View style={styles.searchModalContent}>
              <View style={styles.searchModalHeader}>
                <Text style={styles.searchModalTitle}>Select Section Code</Text>
                <TouchableOpacity style={styles.closeButton} onPress={() => setShowSearchModal(false)}>
                  <Icon name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.searchContainer}>
                <Icon name="search" size={20} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by section code or subdivision name"
                  value={searchQuery}
                  onChangeText={handleSearch}
                  autoFocus={true}
                />
              </View>

              <FlatList
                data={filteredSectionCodes}
                renderItem={renderSectionItem}
                keyExtractor={(item) => item.so_code.toString()}
                style={styles.sectionList}
                showsVerticalScrollIndicator={true}
              />
            </View>
          </View>
        </Modal>

        {/* Retry Modal */}
        <Modal
          visible={showRetryModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowRetryModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Error</Text>
              </View>
              <View style={styles.modalBody}>
                <Icon name="alert-circle" size={40} color="#FF5252" style={styles.modalIcon} />
                <Text style={styles.modalText}>
                  Failed to fetch customers for this section. Please try again or select a different section code.
                </Text>
                <Text style={styles.errorDetails}>{errorMessage}</Text>
              </View>
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowRetryModal(false)
                    setIsLocked(false)
                  }}
                >
                  <Text style={styles.modalButtonText}>Change Section</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.retryButton]} onPress={handleRetry}>
                  <Text style={[styles.modalButtonText, { color: "#FFFFFF" }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
      <Footer />
    </AndroidStatusBarSafeView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#F5F5F5",
  },
  networkIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
  },
  networkText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontWeight: "500",
  },
  lastSyncContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5E9",
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
  },
  lastSyncText: {
    color: "#2E7D32",
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E1F5FE",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  icon: {
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#0277BD",
  },
  sectionCodeContainer: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
  },
  lockButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  lockedButton: {
    backgroundColor: "#4CAF50",
  },
  unlockedButton: {
    backgroundColor: "#FF9800",
  },
  lockButtonText: {
    color: "#FFFFFF",
    fontWeight: "500",
    fontSize: 14,
    marginLeft: 4,
  },
  dropdownContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  searchableDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  dropdownText: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  placeholderText: {
    color: "#999",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  loadingText: {
    marginLeft: 10,
    color: "#666666",
  },
  statusContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
    paddingTop: 16,
  },
  loadingStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  processingContainer: {
    alignItems: "center",
    backgroundColor: "#FFF9C4",
    padding: 12,
    borderRadius: 8,
  },
  processingText: {
    color: "#F57F17",
    fontSize: 14,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
  },
  successText: {
    marginLeft: 8,
    color: "#2E7D32",
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previousButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#757575",
    padding: 16,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
  },
  disabledButton: {
    backgroundColor: "#CCCCCC",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginHorizontal: 8,
  },
  currentSectionIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4CAF50",
  },
  currentSectionText: {
    marginLeft: 8,
    color: "#2E7D32",
    fontSize: 14,
    fontWeight: "500",
  },
  syncStatusContainer: {
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  syncIntervalInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  syncIntervalText: {
    color: "#666666",
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  // Search Modal Styles
  searchModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  searchModalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    width: "90%",
    maxHeight: "80%",
    overflow: "hidden",
  },
  searchModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  searchModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f9f9f9",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },
  sectionList: {
    maxHeight: 400,
  },
  sectionItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sectionItemText: {
    fontSize: 16,
    color: "#333",
  },
  // Existing Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    width: "90%",
    maxWidth: 400,
    overflow: "hidden",
  },
  modalHeader: {
    backgroundColor: "#FF5252",
    padding: 16,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  modalBody: {
    padding: 20,
    alignItems: "center",
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalText: {
    fontSize: 16,
    color: "#333333",
    textAlign: "center",
    marginBottom: 10,
  },
  errorDetails: {
    fontSize: 14,
    color: "#666666",
    textAlign: "center",
  },
  modalFooter: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
  },
  modalButton: {
    flex: 1,
    padding: 16,
    alignItems: "center",
  },
  cancelButton: {
    borderRightWidth: 1,
    borderRightColor: "#EEEEEE",
  },
  retryButton: {
    backgroundColor: "#007AFF",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#007AFF",
  },
})

export default AddMeterScreen
