"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Modal,
  Platform,
  Alert,
} from "react-native"
import Footer from "../components/Footer"

import { useNavigation } from "@react-navigation/native"
import Icon from "react-native-vector-icons/Ionicons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import SQLite from "react-native-sqlite-storage"
import { Camera, CameraType } from "react-native-camera-kit"
import NetInfo from "@react-native-community/netinfo"
import AndroidStatusBarSafeView from "../components/AndroidStatusBarSafeView"
import AppHeader from "../components/AppHeader"
// Enable debugging and promises for SQLite
SQLite.DEBUG(true)
SQLite.enablePromise(true)
import { getOldMeterCache, saveOldMeterCache } from "../database/oldMeterCacheDB"

const CustomerSearchScreen = ({ route }) => {
  const navigation = useNavigation()
  const { sectionCode } = route.params
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [customerData, setCustomerData] = useState(null)
  const [location, setLocation] = useState(null)
  const [isScannerVisible, setIsScannerVisible] = useState(false)
  const cameraRef = useRef(null)
  const [apiError, setApiError] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  const [searchMode, setSearchMode] = useState("online")
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [db, setDb] = useState(null)
  const [meterAlreadyInstalled, setMeterAlreadyInstalled] = useState(false)

  useEffect(() => {
    initializeDatabase()
    loadLocation()
    checkNetworkStatus()

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable
      setIsOnline(online)
      setSearchMode(online ? "online" : "offline")
    })

    return () => {
      unsubscribe()
      if (db) {
        db.close()
      }
    }
  }, [])

  // Initialize database connection
  const initializeDatabase = async () => {
    try {
      const database = await SQLite.openDatabase({
        name: "MeterReadingDB",
        location: "default",
      })

      console.log("Database opened successfully")
      setDb(database)

      // Check database status after opening
      await checkDatabaseStatus(database)
    } catch (error) {
      console.error("Error opening database:", error)
      setApiError("Failed to open database")
    }
  }

  // Check database status and count customers
  const checkDatabaseStatus = async (database) => {
    if (!database) return

    try {
      database.transaction((tx) => {
        tx.executeSql(
          "SELECT COUNT(*) as count FROM customer_data",
          [],
          (_, { rows }) => {
            const count = rows.item(0).count
            console.log(`Total customers in database: ${count}`)
            setTotalCustomers(count)
          },
          (_, error) => {
            console.error("Error counting customers:", error)
            setTotalCustomers(0)
          },
        )
      })
    } catch (error) {
      console.error("Error checking database status:", error)
    }
  }

  const checkNetworkStatus = async () => {
    try {
      const state = await NetInfo.fetch()
      const online = state.isConnected && state.isInternetReachable
      setIsOnline(online)
      setSearchMode(online ? "online" : "offline")
    } catch (error) {
      console.error("Error checking network status:", error)
      setIsOnline(false)
      setSearchMode("offline")
    }
  }

  const loadLocation = async () => {
    try {
      const locationStr = await AsyncStorage.getItem("currentLocation")
      if (locationStr) {
        setLocation(JSON.parse(locationStr))
      }
    } catch (error) {
      console.error("Error loading location:", error)
    }
  }

  // Updated: Check if meter is already installed (only if serial_no_new has a value)
  const checkMeterInstallationStatus = (data) => {
    if (data.meter_details && typeof data.meter_details === "object" && data.meter_details.account_id) {
      // Check if serial_no_new has a valid non-empty value
      return !(
        data.meter_details.serial_no_new === null ||
        data.meter_details.serial_no_new === undefined ||
        data.meter_details.serial_no_new.toString().trim() === ""
      )
    }
    return false
  }

  // Direct database search by exact account ID for offline mode
  const searchOfflineCustomerByAccountId = (accountId) => {
    if (!db) {
      console.error("Database not initialized")
      setApiError("Database not initialized")
      return
    }

    setLoading(true)
    setApiError(null)

    console.log("Searching offline for account ID:", accountId)

    try {
      db.transaction((tx) => {
        tx.executeSql(
          "SELECT * FROM customer_data WHERE account_id = ?",
          [accountId],
          (_, { rows }) => {
            console.log(`Found ${rows.length} results for account ID ${accountId}`)

            if (rows.length > 0) {
              const customer = rows.item(0)
              console.log("Found customer:", JSON.stringify(customer, null, 2))

              setCustomerData(customer)
              setMeterAlreadyInstalled(false) // Offline mode doesn't check meter installation
              setApiError(null)

              AsyncStorage.setItem("selectedCustomer", JSON.stringify(customer))
            } else {
              setCustomerData(null)
              setMeterAlreadyInstalled(false)
              setApiError(
                `Either Meter Already Installed OR No consumer details available with account ID ${accountId}.`,
              )
            }
            setLoading(false)
          },
          (_, error) => {
            console.error("Database search error:", error)
            setApiError(`Database error: ${error.message}`)
            setCustomerData(null)
            setMeterAlreadyInstalled(false)
            setLoading(false)
          },
        )
      })
    } catch (error) {
      console.error("Error in searchOfflineCustomerByAccountId:", error)
      setApiError(`Error searching offline: ${error.message}`)
      setCustomerData(null)
      setMeterAlreadyInstalled(false)
      setLoading(false)
    }
  }

  const fetchDataFromAPI = async (accountId) => {
    try {
      setApiError(null)
      const token = await AsyncStorage.getItem("userToken")
      if (!token) {
        console.error("No auth token available")
        setApiError("Authentication failed. Please log in again.")
        return
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      }

      console.log(`Fetching data for account ID: ${accountId}`)

      const response = await fetch(`https://gescom.vishvin.com/api/get-consumer?account_id=${accountId}`, {
        method: "GET",
        headers: headers,
      })

      const responseText = await response.text()
      let data

      try {
        data = JSON.parse(responseText)
      } catch (e) {
        console.error("Failed to parse response as JSON:", e)
        setApiError("Invalid response from server. Please try again.")
        setLoading(false)
        return
      }

      if (!response.ok) {
        setApiError(`Account_ID not found in the Database(${response.status})`)
        setLoading(false)
        return
      }

      if (data.status) {
        if (data.section === sectionCode) {
          // Check if meter is already installed (using updated logic)
          const meterInstalled = checkMeterInstallationStatus(data)
          setMeterAlreadyInstalled(meterInstalled)
          setCustomerData(data)
          AsyncStorage.setItem("selectedCustomer", JSON.stringify(data))

          if (meterInstalled) {
            // Show alert for already installed meter
            // Alert.alert(
            //   "Meter Already Installed",
            //   `This consumer already has a meter installed.\n\nMeter Details:\nAccount ID: ${data.meter_details.account_id}\nCategory: ${data.meter_details.category}\nOld Serial No: ${data.meter_details.serial_no_old}\nNew Serial No: ${data.meter_details.serial_no_new}\nInstalled By: ${data.meter_details.created_by_name}\nInstalled On: ${data.meter_details.created_at}`,
            //   [{ text: "OK", style: "default" }],
            // )
          }
        } else {
          setApiError(`This consumer belongs to section ${data.section}, not the selected section ${sectionCode}.`)
          setCustomerData(null)
          setMeterAlreadyInstalled(false)
        }
      } else {
        setApiError(data.msg || "Customer not found")
        setCustomerData(null)
        setMeterAlreadyInstalled(false)
      }
    } catch (error) {
      console.error("Error fetching data from API:", error)
      setApiError("Network error. Please check your connection and try again.")
      setCustomerData(null)
      setMeterAlreadyInstalled(false)
    } finally {
      setLoading(false)
    }
  }

 const fetchHalfInstalledWorkData = async (accountId) => {
  try {
    console.log("[v0] Starting fetchHalfInstalledWorkData for account:", accountId)

    const token = await AsyncStorage.getItem("userToken")
    if (!token) {
      console.error("No auth token available for half installed work API")
      return null
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    console.log("[v0] Calling half installed work API with account_id:", accountId)

    const response = await fetch(`https://gescom.vishvin.com/api/half_installed_work?account_id=${accountId}`, {
      method: "GET",
      headers: headers,
    })

    console.log("[v0] API response status:", response.status)

    if (!response.ok) {
      console.log(`[v0] Half installed work API returned status: ${response.status}`)
      return null
    }

    const data = await response.json()
    console.log("[v0] Half installed work API response:", JSON.stringify(data, null, 2))

    if (data && data.account_id) {
      // Format image URLs properly
      const formatImageUrl = (path) => {
        if (!path) return null;
        // Remove any leading slashes or unwanted characters
        const cleanPath = path.replace(/^\/+/, '');
        return `https://gescom.vishvin.com/${cleanPath}`;
      };

      const transformedData = {
        account_id: data.account_id,
        photo1: formatImageUrl(data.image_1_old),
        photo2: formatImageUrl(data.image_2_old),
        photo3: formatImageUrl(data.image_3_old),
        meterMake: data.meter_make_old || "",
        serialNumber: data.serial_no_old || "",
        meterCategory: data.category || "",
        manufactureYear: data.mfd_year_old || "",
        finalReading: data.final_reading || "",
        // Additional fields that might be needed
        initialReading: data.initial_reading_kwh || "",
        initialReadingKvah: data.initial_reading_kvah || "",
        // Include original API data for reference
        originalApiData: data,
      }

      console.log("[v0] Transformed half installed work data:", JSON.stringify(transformedData, null, 2))

      try {
        await saveOldMeterCache(transformedData)
        console.log("[v0] Successfully saved API data to old meter cache")
      } catch (cacheError) {
        console.error("[v0] Error saving API data to cache:", cacheError)
      }

      return transformedData
    } else {
      console.log("[v0] API response does not contain expected account_id field")
    }

    return null
  } catch (error) {
    console.error("[v0] Error fetching half installed work data:", error)
    return null
  }
}
  const isCachedDataMeaningful = (cachedData) => {
    if (!cachedData) return false

    // Check if any of the important fields have meaningful values (not empty strings or null)
    const hasSerialNumber = cachedData.serialNumber && cachedData.serialNumber.trim() !== ""
    const hasMeterMake = cachedData.meterMake && cachedData.meterMake.trim() !== ""
    const hasFinalReading = cachedData.finalReading && cachedData.finalReading.trim() !== ""
    const hasPhotos = cachedData.photo1 || cachedData.photo2 || cachedData.photo3

    // Return true if at least one meaningful field exists
    return hasSerialNumber || hasMeterMake || hasFinalReading || hasPhotos
  }

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setApiError("Please enter an Account ID")
      return
    }

    // For offline mode, only search if it's exactly 10 digits
    if (searchMode === "offline" && searchQuery.length !== 10) {
      setApiError("Please enter a complete 10-digit Account ID")
      return
    }

    setCustomerData(null)
    setMeterAlreadyInstalled(false)
    setApiError(null)
    setLoading(true)

    if (searchMode === "offline") {
      searchOfflineCustomerByAccountId(searchQuery)
    } else {
      fetchDataFromAPI(searchQuery)
    }
  }, [searchQuery, sectionCode, searchMode, db])

  const handleSearchInputChange = (text) => {
    setSearchQuery(text)

    // For offline mode, automatically search when 10 digits are entered
    if (searchMode === "offline" && text.length === 10 && /^\d{10}$/.test(text)) {
      setCustomerData(null)
      setMeterAlreadyInstalled(false)
      setApiError(null)
      setLoading(true)
      searchOfflineCustomerByAccountId(text)
    } else if (text.length < 10) {
      // Clear customer data if less than 10 digits
      setCustomerData(null)
      setMeterAlreadyInstalled(false)
      setApiError(null)
    }
  }

  const handleNext = async () => {
    if (!customerData) {
      setApiError("Please search and select a customer before proceeding.")
      return
    }

    // Prevent navigation if meter is already installed
    if (meterAlreadyInstalled) {
      Alert.alert(
        "Cannot Proceed",
        "This consumer already has a meter installed. You cannot proceed to meter installation.",
        [{ text: "OK", style: "default" }],
      )
      return
    }

    try {
      await AsyncStorage.removeItem("oldMeterData")
      await AsyncStorage.removeItem("newMeterData")
      await AsyncStorage.setItem("selectedCustomer", JSON.stringify(customerData))

      console.log("[v0] Checking for cached old meter data for account:", customerData.account_id)

      let cachedOldMeterData = null
      try {
        cachedOldMeterData = await getOldMeterCache(customerData.account_id)
        console.log("[v0] Retrieved cached old meter data:", cachedOldMeterData ? "Found" : "Not found")

        if (cachedOldMeterData && !isCachedDataMeaningful(cachedOldMeterData)) {
          console.log("[v0] Cached data exists but is empty/meaningless, will fetch from API")
          cachedOldMeterData = null // Treat empty cached data as no cached data
        }
      } catch (cacheError) {
        console.error("[v0] Error retrieving cached old meter data:", cacheError)
      }

      if (!cachedOldMeterData) {
        console.log("[v0] No meaningful cached old meter data found, trying half installed work API...")
        cachedOldMeterData = await fetchHalfInstalledWorkData(customerData.account_id)

        if (cachedOldMeterData) {
          console.log("[v0] Successfully retrieved and cached data from half installed work API")
        } else {
          console.log("[v0] No data found in half installed work API either")
        }
      } else {
        console.log("[v0] Using existing meaningful cached old meter data")
      }

      console.log("[v0] Navigating to OldMeter with cachedOldMeterData:", cachedOldMeterData ? "Present" : "Null")

      navigation.navigate("OldMeter", {
        customerData,
        sectionCode,
        location,
        cachedOldMeterData, // Pass the cached data (from DB or API) to OldMeter screen
      })
    } catch (error) {
      console.error("[v0] Error navigating to OldMeter:", error)
      setApiError("An unexpected error occurred. Please try again.")
    }
  }

  const handleBarCodeScanned = (event) => {
    if (event.nativeEvent.codeStringValue) {
      const scannedValue = event.nativeEvent.codeStringValue.slice(0, 10)
      setIsScannerVisible(false)
      setSearchQuery(scannedValue)

      // Automatically search after scanning
      setCustomerData(null)
      setMeterAlreadyInstalled(false)
      setApiError(null)
      setLoading(true)

      if (searchMode === "offline") {
        searchOfflineCustomerByAccountId(scannedValue)
      } else {
        fetchDataFromAPI(scannedValue)
      }
    }
  }

  const dismissError = () => {
    setApiError(null)
  }

  return (
    <AndroidStatusBarSafeView backgroundColor="#F5F5F5">
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      <AppHeader />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-undo" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Consumer Search</Text>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={searchMode === "offline" ? "Enter 10-digit Account ID" : "Enter Account ID/Scan Barcode"}
              placeholderTextColor="#757575"
              value={searchQuery}
              onChangeText={handleSearchInputChange}
              onSubmitEditing={handleSearch}
              maxLength={10}
              // keyboardType="numeric"
            />
            <TouchableOpacity style={styles.scanButton} onPress={() => setIsScannerVisible(true)}>
              <Icon name="barcode-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>

          {location && (
            <Text style={styles.locationText}>
              Current Location: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </Text>
          )}

          {loading && <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />}

          {/* Show content based on meter installation status */}
          {customerData && (
            <>
              {meterAlreadyInstalled ? (
                // Show only meter details when meter is already installed
                <>
                  <View style={styles.meterInstalledAlert}>
                    <Icon name="warning" size={24} color="#ff6b35" />
                    <Text style={styles.meterInstalledText}>Meter Already Installed</Text>
                  </View>

                  <View style={styles.meterDetailsContainer}>
                    <Text style={styles.meterDetailsTitle}>Installed Meter Details:</Text>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Account ID:</Text>
                      <Text style={styles.value}>{customerData.meter_details.account_id}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Category:</Text>
                      <Text style={styles.value}>{customerData.meter_details.category}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Old Serial No:</Text>
                      <Text style={styles.value}>{customerData.meter_details.serial_no_old}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>New Serial No:</Text>
                      <Text style={styles.value}>{customerData.meter_details.serial_no_new}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Installed By:</Text>
                      <Text style={styles.value}>{customerData.meter_details.created_by_name}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Installation Date:</Text>
                      <Text style={styles.value}>{customerData.meter_details.created_at}</Text>
                    </View>
                  </View>
                </>
              ) : (
                // Show consumer details when meter is not installed
                <>
                  <View style={styles.customerDataContainer}>
                    <Text style={styles.dataTitle}>Consumer Details:</Text>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Account ID:</Text>
                      <Text style={styles.value}>{customerData.account_id}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>RR Number:</Text>
                      <Text style={styles.value}>{customerData.rr_no}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Name:</Text>
                      <Text style={styles.value}>{customerData.consumer_name}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Address:</Text>
                      <Text style={styles.value}>{customerData.consumer_address}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Division:</Text>
                      <Text style={styles.value}>{customerData.division}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Sub Division:</Text>
                      <Text style={styles.value}>{customerData.sub_division}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Phase Type:</Text>
                      <Text style={styles.value}>{customerData.phase_type}</Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.label}>Previous Reading:</Text>
                      <Text style={styles.value}>
                        {customerData.previous_final_reading || "0"} ({customerData.billed_date || "0"})
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                    <Text style={styles.nextButtonText}>Next</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </ScrollView>

        <Modal visible={isScannerVisible} animationType="slide" onRequestClose={() => setIsScannerVisible(false)}>
          <SafeAreaView style={styles.scannerContainer}>
            <Camera
              ref={cameraRef}
              style={styles.scanner}
              cameraType={CameraType.Back}
              scanBarcode={true}
              onReadCode={handleBarCodeScanned}
              showFrame={true}
              laserColor="red"
              frameColor="white"
            />
            <TouchableOpacity style={styles.closeScannerButton} onPress={() => setIsScannerVisible(false)}>
              <Text style={styles.closeScannerButtonText}>Close Scanner</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Modal>

        {/* Error Modal */}
        <Modal visible={apiError !== null} transparent={true} animationType="fade" onRequestClose={dismissError}>
          <View style={styles.modalOverlay}>
            <View style={styles.errorModal}>
              <Text style={styles.errorTitle}>{searchMode === "offline" ? "Offline Search" : "Error"}</Text>
              <Text style={styles.errorMessage}>{apiError}</Text>
              <TouchableOpacity style={styles.okButton} onPress={dismissError}>
                <Text style={styles.okButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
      <Footer />
    </AndroidStatusBarSafeView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
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
  },
  searchModeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 4,
  },
  searchModeText: {
    color: "#FFFFFF",
    marginLeft: 8,
    fontWeight: "500",
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 16,
    fontWeight: "300",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    color: "#000",
    fontSize: 16,
  },
  scanButton: {
    width: 48,
    height: 48,
    backgroundColor: "#28a745",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  searchButton: {
    backgroundColor: "#007AFF",
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  searchButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  loader: {
    marginVertical: 20,
  },
  meterInstalledAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff3cd",
    borderColor: "#ffeaa7",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  meterInstalledText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#856404",
  },
  customerDataContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  meterDetailsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#dee2e6",
  },
  dataTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: "#007AFF",
  },
  meterDetailsTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: "#ff6b35",
  },
  dataRow: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "flex-start",
  },
  label: {
    flex: 1,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  value: {
    flex: 2,
    fontSize: 16,
    color: "#333",
  },
  nextButton: {
    backgroundColor: "#007AFF",
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 20,
  },
  nextButtonDisabled: {
    backgroundColor: "#cccccc",
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 20,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  nextButtonTextDisabled: {
    color: "#666666",
    fontSize: 16,
    fontWeight: "600",
  },
  locationText: {
    fontSize: 14,
    color: "#666",
    marginTop: 16,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "black",
  },
  scanner: {
    flex: 1,
  },
  closeScannerButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    alignItems: "center",
  },
  closeScannerButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  errorModal: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#333",
  },
  okButton: {
    alignSelf: "flex-end",
  },
  okButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
})

export default CustomerSearchScreen
