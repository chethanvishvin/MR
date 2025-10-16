"use client"

import React from "react"

import { useState, useEffect, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  AppState,
  TextInput,
  Dimensions,
} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { openDatabase } from "react-native-sqlite-storage"
import Icon from "react-native-vector-icons/Ionicons"
import { useAuth } from "../context/AuthContext"
import { useFocusEffect } from "@react-navigation/native"
import AndroidStatusBarSafeView from "../components/AndroidStatusBarSafeView"
import AppHeader from "../components/AppHeader"
import Footer from "../components/Footer"

const db = openDatabase({ name: "MeterReadingDB.db" })
const ITEMS_PER_PAGE = 8
const { width } = Dimensions.get("window")

const HomeScreen = ({ navigation }) => {
  const [installedRecords, setInstalledRecords] = useState([])
  const [filteredRecords, setFilteredRecords] = useState([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const isMounted = useRef(true)
  const appState = useRef(AppState.currentState)
  const horizontalScrollRef = useRef(null)
  const verticalScrollRef = useRef(null)
  const [todayInstalledCount, setTodayInstalledCount] = useState(0)

  const { isLoggedIn, userName } = useAuth()

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      appState.current = nextAppState
    })

    return () => {
      isMounted.current = false
      subscription.remove()
    }
  }, [])

  const safeAlert = (title, message) => {
    if (isMounted.current && appState.current === "active") {
      requestAnimationFrame(() => {
        if (isMounted.current && appState.current === "active") {
          Alert.alert(title, message)
        }
      })
    }
  }

  // Use useFocusEffect to refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (isLoggedIn) {
        console.log("HomeScreen focused, refreshing data...")
        initializeScreen()
      }
    }, [isLoggedIn]),
  )
 
  useEffect(() => {
    if (isLoggedIn) {
      initializeScreen()
    }
  }, [isLoggedIn])

  useEffect(() => {
    filterAndPaginateRecords()
  }, [installedRecords, searchQuery, currentPage])

  useEffect(() => {
    calculateTodayInstallations()
  }, [installedRecords])

  const initializeScreen = async () => {
    try {
      const id = await AsyncStorage.getItem("userId")
      if (isMounted.current) {
        setUserId(id)
        await createTable()
        await fetchInstalledRecords(id)
      } 
    } catch (error) {
      console.error("Error initializing screen:", error)
      safeAlert("Error", "Failed to initialize the screen. Please try again.")
    }
  }

  const filterAndPaginateRecords = () => {
    let filtered = installedRecords
    if (searchQuery.trim() !== "") {
      filtered = installedRecords.filter((record) =>
        record.account_id.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    }

    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
    setTotalPages(pages || 1)

    if (currentPage > pages && pages > 0) {
      setCurrentPage(1)
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const paginatedRecords = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

    setFilteredRecords(paginatedRecords)
    setTotalRecords(filtered.length)
  }

  const calculateTodayInstallations = () => {
    const today = new Date().toDateString()
    const todayCount = installedRecords.filter((record) => {
      if (record.created_at) {
        const recordDate = new Date(record.created_at).toDateString()
        return recordDate === today
      }
      return false
    }).length
    setTodayInstalledCount(todayCount)
  }

  const createTable = () => {
    return new Promise((resolve, reject) => {
      db.transaction(
        (tx) => {
          tx.executeSql(
            "CREATE TABLE IF NOT EXISTS CustomerData (id TEXT PRIMARY KEY, account_id TEXT, rr_no TEXT, consumer_name TEXT, consumer_address TEXT, division TEXT, section TEXT, sub_division TEXT, phase_type TEXT, previous_final_reading TEXT, billed_date TEXT)",
            [],
            () => {
              console.log("CustomerData table created or already exists")
              resolve()
            },
            (_, error) => {
              console.error("Error creating table:", error)
              reject(error)
            },
          )
        },
        (error) => {
          console.error("Transaction error:", error)
          reject(error)
        },
      )
    })
  }

  const fetchInstalledRecords = async (id) => {
    if (!id) {
      console.error("User ID not available")
      return
    }

    if (isMounted.current) {
      setLoading(true)
    }

    try {
      const API_URL = `https://gescom.vishvin.com/mobile-app/api/installed_records/${id}`
      const token = await AsyncStorage.getItem("userToken")

      console.log("Fetching installed records for user:", id)

      const response = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      })

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`)
      }

      const data = await response.json()
      const allRecords = data.data || []

      console.log(`Fetched ${allRecords.length} installed records`)

      const transformedRecords = allRecords.map((record) => ({
        id: record.meter_main.account_id,
        account_id: record.meter_main.account_id,
        serial_no_old: record.meter_main.serial_no_old,
        serial_no_new: record.meter_main.serial_no_new,
        created_at: record.meter_main.created_at,
      }))

      if (isMounted.current) {
        setInstalledRecords(transformedRecords)
        setTotalRecords(transformedRecords.length)
        console.log(`HomeScreen updated with ${transformedRecords.length} records`)
      }
    } catch (error) {
      console.error("Error fetching installed records:", error)
      safeAlert("Error", "Failed to fetch installed records. Please check your network connection and try again.")
    } finally {
      if (isMounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  const onRefresh = () => {
    setRefreshing(true)
    fetchInstalledRecords(userId)
  }

  const handleViewRecord = (record) => {
    Alert.alert("View Record", `Viewing details for account ID: ${record.account_id}`)
  }

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      // Reset scroll position when page changes
      if (verticalScrollRef.current) {
        verticalScrollRef.current.scrollTo({ y: 0, animated: false })
      }
      if (horizontalScrollRef.current) {
        horizontalScrollRef.current.scrollTo({ x: 0, animated: false })
      }
    }
  }

  const renderPaginationNumbers = () => {
    const pages = []
    const maxVisiblePages = 5

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    // Add first page and ellipsis if needed
    if (startPage > 1) {
      pages.push(
        <TouchableOpacity
          key={1}
          style={[styles.pageButton, currentPage === 1 && styles.activePageButton]}
          onPress={() => handlePageChange(1)}
        >
          <Text style={[styles.pageButtonText, currentPage === 1 && styles.activePageButtonText]}>1</Text>
        </TouchableOpacity>,
      )

      if (startPage > 2) {
        pages.push(
          <View key="start-ellipsis" style={styles.ellipsis}>
            <Text>...</Text>
          </View>,
        )
      }
    }

    // Add visible page buttons
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <TouchableOpacity
          key={i}
          style={[styles.pageButton, currentPage === i && styles.activePageButton]}
          onPress={() => handlePageChange(i)}
        >
          <Text style={[styles.pageButtonText, currentPage === i && styles.activePageButtonText]}>{i}</Text>
        </TouchableOpacity>,
      )
    }

    // Add last page and ellipsis if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <View key="end-ellipsis" style={styles.ellipsis}>
            <Text>...</Text>
          </View>,
        )
      }

      pages.push(
        <TouchableOpacity
          key={totalPages}
          style={[styles.pageButton, currentPage === totalPages && styles.activePageButton]}
          onPress={() => handlePageChange(totalPages)}
        >
          <Text style={[styles.pageButtonText, currentPage === totalPages && styles.activePageButtonText]}>
            {totalPages}
          </Text>
        </TouchableOpacity>,
      )
    }

    return pages
  }

  if (!isLoggedIn) {
    return (
      <AndroidStatusBarSafeView backgroundColor="#F5F5F5">
        <AppHeader />
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Please log in to view installed meters</Text>
          </View>
        </View>
      </AndroidStatusBarSafeView>
    )
  }

  return (
    <AndroidStatusBarSafeView backgroundColor="#F5F5F5">
      <AppHeader />
      <View style={styles.container}>
      <View style={styles.header}>
  <View>
    <Text>
      <Text style={styles.label}>Installed by: </Text>
      <Text style={styles.value}>{userName || "Unknown"}</Text>
    </Text>
    <Text>
      <Text style={styles.label}>Installed Meters today: </Text>
      <Text style={styles.value}>{todayInstalledCount}</Text>
    </Text>
    <Text>
      <Text style={styles.label}>Installed Meters: </Text>
      <Text style={styles.value}>{totalRecords}</Text>
    </Text>
  </View>

  <TouchableOpacity onPress={() => fetchInstalledRecords(userId)} disabled={loading}>
    <Icon name="refresh" size={24} color="#007AFF" />
  </TouchableOpacity>
</View>


        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Account ID"
            placeholderTextColor="#999999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery !== "" && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearButton}>
              <Icon name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tableContainer}>
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            showsHorizontalScrollIndicator={true}
            scrollEventThrottle={16}
            style={styles.horizontalScroll}
            contentContainerStyle={styles.horizontalScrollContent}
          >
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <View style={[styles.headerCellContainer, { width: 60 }]}>
                  <Text style={styles.headerCell}>SI No</Text>
                </View>
                <View style={[styles.headerCellContainer, { width: 120 }]}>
                  <Text style={styles.headerCell}>Account ID</Text>
                </View>
                <View style={[styles.headerCellContainer, { width: 120 }]}>
                  <Text style={styles.headerCell}>Old Meter</Text>
                </View>
                <View style={[styles.headerCellContainer, { width: 120 }]}>
                  <Text style={styles.headerCell}>New Meter</Text>
                </View>
                <View style={[styles.headerCellContainer, { width: 100 }]}>
                  <Text style={styles.headerCell}>Action</Text>
                </View>
              </View>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading records...</Text>
                </View>
              ) : (
                <ScrollView
                  ref={verticalScrollRef}
                  style={styles.verticalScroll}
                  showsVerticalScrollIndicator={true}
                  scrollEventThrottle={16}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                  contentContainerStyle={styles.verticalScrollContent}
                >
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((item, index) => (
                      <View key={item.id} style={styles.tableRow}>
                        <View style={[styles.cellContainer, { width: 60 }]}>
                          <Text style={styles.cell}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</Text>
                        </View>
                        <View style={[styles.cellContainer, { width: 120 }]}>
                          <Text style={styles.cell}>{item.account_id}</Text>
                        </View>
                        <View style={[styles.cellContainer, { width: 120 }]}>
                          <Text style={styles.cell}>{item.serial_no_old}</Text>
                        </View>
                        <View style={[styles.cellContainer, { width: 120 }]}>
                          <Text style={styles.cell}>{item.serial_no_new}</Text>
                        </View>
                        <View style={[styles.cellContainer, { width: 100 }]}>
                          <TouchableOpacity style={styles.viewButton} onPress={() => handleViewRecord(item)}>
                            <Text style={styles.viewButtonText}>View</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>
                        {searchQuery ? "No matching records found" : "No installed meters found"}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </ScrollView>

          {!loading && filteredRecords.length > 0 && (
            <View style={styles.paginationContainer}>
              <TouchableOpacity
                style={[styles.paginationNavButton, currentPage === 1 && styles.paginationNavButtonDisabled]}
                onPress={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <Icon name="chevron-back" size={16} color={currentPage === 1 ? "#CCCCCC" : "#007AFF"} />
              </TouchableOpacity>

              {renderPaginationNumbers()}

              <TouchableOpacity
                style={[styles.paginationNavButton, currentPage === totalPages && styles.paginationNavButtonDisabled]}
                onPress={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <Icon name="chevron-forward" size={16} color={currentPage === totalPages ? "#CCCCCC" : "#007AFF"} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
      <Footer />
    </AndroidStatusBarSafeView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerText: {
    fontSize: 18,
    
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    margin: 16,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: "#333333",
  },
  clearButton: {
    padding: 4,
  },
  tableContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    margin: 16,
    marginTop: 8,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 80,
  },
  horizontalScroll: {
    flex: 1,
  },
  horizontalScrollContent: {
    flexGrow: 1,
  },
  verticalScroll: {
    flex: 1,
    maxHeight: Dimensions.get("window").height * 0.6, // Limit height to ensure pagination is visible
  },
  verticalScrollContent: {
    flexGrow: 1,
  },
  tableWrapper: {
    minWidth: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F8F9FA",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerCellContainer: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: "#E0E0E0",
    justifyContent: "center",
  },
  headerCell: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333333",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  cellContainer: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: "#E0E0E0",
    justifyContent: "center",
  },
  cell: {
    fontSize: 14,
    color: "#666666",
  },
  viewButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignItems: "center",
  },
  viewButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  label: {
    fontSize: 18,
    fontWeight: "600",
    fontStyle: "italic",
    color: "#404040",
  },
  
  value: {
    fontSize: 18,
    fontWeight: "bold",
    fontStyle: "normal",
    color: "#002060", // or any accent color
  },
  
  emptyState: {
    padding: 20,
    alignItems: "center",
    width: 520,
  },
  emptyText: {
    fontSize: 16,
    color: "#666666",
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
    width: 520,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#666666",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    backgroundColor: "#FFFFFF",
    flexWrap: "wrap",
  },
  paginationNavButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 4,
    marginHorizontal: 2,
  },
  paginationNavButtonDisabled: {
    opacity: 0.5,
  },
  pageButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 4,
    marginHorizontal: 2,
    backgroundColor: "#F0F0F0",
  },
  activePageButton: {
    backgroundColor: "#007AFF",
  },
  pageButtonText: {
    fontSize: 14,
    color: "#333333",
  },
  activePageButtonText: {
    color: "#FFFFFF",
  },
  ellipsis: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  infoContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  infoText: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 4,
  },
})

export default HomeScreen
