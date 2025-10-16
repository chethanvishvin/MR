"use client"

import { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import {
  getFailedUploads,
  deleteFailedUpload,
  getPendingOldMeterData,
  getPendingNewMeterData,
} from "../utils/databaseUtils"
import NetInfo from "@react-native-community/netinfo"

const { width } = Dimensions.get("window")

const FailedUploadsScreen = ({ navigation }) => {
  const [failedUploads, setFailedUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected && state.isInternetReachable)
    })

    loadFailedUploads()

    return () => {
      unsubscribe()
    }
  }, [])

  const loadFailedUploads = async () => {
    try {
      setLoading(true)
      const uploads = await getFailedUploads()

      // Filter out "Meter record not found" errors - only show duplicate serial number errors
      const filteredUploads = uploads.filter((item) => {
        // Check if this is NOT a "Meter record not found" error
        return !(item.error_message && item.error_message.toLowerCase().includes("meter record not found"))
      })

      // Group uploads by account_id
      const groupedUploads = new Map()

      filteredUploads.forEach((item) => {
        if (!groupedUploads.has(item.account_id)) {
          groupedUploads.set(item.account_id, {
            account_id: item.account_id,
            oldMeter: null,
            newMeter: null,
            hasError: false,
            hasDuplicate: false,
          })
        }

        const group = groupedUploads.get(item.account_id)

        // Check if this is a duplicate error
        const isDuplicate =
          item.is_duplicate_error === 1 ||
          (item.error_message &&
            (item.error_message.toLowerCase().includes("already exists") ||
              item.error_message.toLowerCase().includes("already been taken") ||
              item.error_message.toLowerCase().includes("duplicate")))

        if (isDuplicate) {
          group.hasDuplicate = true
        } else {
          group.hasError = true
        }

        // Store the meter data
        if (item.is_old_meter) {
          group.oldMeter = item
        } else {
          group.newMeter = item
        }
      })

      // Convert map to array
      const consolidatedUploads = Array.from(groupedUploads.values())
      setFailedUploads(consolidatedUploads)
    } catch (error) {
      console.error("Error loading failed uploads:", error)
      Alert.alert("Error", "Failed to load failed uploads. Please try again.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadFailedUploads()
  }

  const handleEdit = async (item) => {
    try {
      // Get the account ID
      const accountId = item.account_id

      // Use the stored old and new meter data
      const oldMeterData = item.oldMeter
      const newMeterData = item.newMeter

      // If we're missing either old or new meter data, try to find it
      if (!oldMeterData || !newMeterData) {
        // Get all pending data
        const pendingOldMeterData = await getPendingOldMeterData()
        const pendingNewMeterData = await getPendingNewMeterData()

        // Find matching records by account_id
        if (!oldMeterData) {
          const foundOldMeter = pendingOldMeterData.find((record) => record.account_id === accountId)
          if (foundOldMeter) {
            item.oldMeter = foundOldMeter
          }
        }

        if (!newMeterData) {
          const foundNewMeter = pendingNewMeterData.find((record) => record.account_id === accountId)
          if (foundNewMeter) {
            item.newMeter = foundNewMeter
          }
        }
      }

      // Prepare the customer data object
      const customerData = {
        account_id: accountId,
        rr_no: item.oldMeter?.rr_no || item.newMeter?.rr_no || "",
        consumer_name: item.oldMeter?.consumer_name || item.newMeter?.consumer_name || "",
        consumer_address: item.oldMeter?.consumer_address || item.newMeter?.consumer_address || "",
        section: item.oldMeter?.section_code || item.newMeter?.section_code || "",
        sub_division: item.oldMeter?.sub_division || item.newMeter?.sub_division || "",
        phase_type: item.oldMeter?.phase_type || item.newMeter?.phase_type || "",
      }

      // Prepare the old meter data object
      const oldMeterDataForEdit = item.oldMeter
        ? {
            account_id: accountId,
            serialNumber: item.oldMeter.serial_no_old || "",
            manufactureYear: item.oldMeter.mfd_year_old || "",
            finalReading: item.oldMeter.final_reading || "",
            meterMake: item.oldMeter.meter_make_old || "",
            photo1: item.oldMeter.image_1_old || null,
            photo2: item.oldMeter.image_2_old || null,
          }
        : {
            account_id: accountId,
            serialNumber: "",
            manufactureYear: "",
            finalReading: "",
            meterMake: "",
            photo1: null,
            photo2: null,
          }

      // Prepare the new meter data object
      const newMeterDataForEdit = item.newMeter
        ? {
            accountId: accountId,
            serialNumber: item.newMeter.serial_no_new || "",
            manufactureYear: item.newMeter.mfd_year_new || "",
            initialReading: item.newMeter.initial_reading || "",
            meterMake: item.newMeter.meter_make_new || "",
            photo1: item.newMeter.image_1_new || null,
            photo2: item.newMeter.image_2_new || null,
          }
        : {
            accountId: accountId,
            serialNumber: "",
            manufactureYear: "",
            initialReading: "",
            meterMake: "",
            photo1: null,
            photo2: null,
          }

      // Navigate to OldMeterScreen with all the data
      navigation.navigate("OldMeter", {
        customerData,
        editMode: true,
        failedUploadId: item.oldMeter ? item.oldMeter.id : null,
        oldMeterData: oldMeterDataForEdit,
        newMeterData: newMeterDataForEdit,
        failedNewMeterId: item.newMeter ? item.newMeter.id : null,
      })
    } catch (error) {
      console.error("Error preparing edit data:", error)
      Alert.alert("Error", "Failed to load meter data for editing. Please try again.")
    }
  }

  const handleDelete = (item) => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete all failed uploads for this account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete both old and new meter records if they exist
              if (item.oldMeter) {
                await deleteFailedUpload(item.oldMeter.id, true)
              }

              if (item.newMeter) {
                await deleteFailedUpload(item.newMeter.id, false)
              }

              // Refresh the list
              loadFailedUploads()
            } catch (error) {
              console.error("Error deleting failed upload:", error)
              Alert.alert("Error", "Failed to delete the upload. Please try again.")
            }
          },
        },
      ],
    )
  }

  const renderItem = ({ item }) => {
    // Determine error type and message
    let errorType = "Error"
    let errorMessage = "Unknown error"
    let statusStyle = styles.errorStatus

    if (item.hasDuplicate) {
      errorType = "Duplicate"
      errorMessage = item.newMeter
        ? item.newMeter.error_message || "The serial no new has already been taken."
        : item.oldMeter
          ? item.oldMeter.error_message
          : "Duplicate serial number"
      statusStyle = styles.duplicateStatus
    } else if (item.hasError) {
      errorType = "Error"
      errorMessage = item.newMeter
        ? item.newMeter.error_message || "Unknown error"
        : item.oldMeter
          ? item.oldMeter.error_message
          : "Unknown error"
    }

    // Get serial number to display
    const serialNumber = item.newMeter ? item.newMeter.serial_no_new : item.oldMeter ? item.oldMeter.serial_no_old : ""

    return (
      <View style={styles.itemContainer}>
        <View style={styles.itemHeader}>
          <Text style={styles.accountId}>Account ID: {item.account_id}</Text>
          <View style={[styles.statusBadge, statusStyle]}>
            <Text style={styles.statusText}>{errorType}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.label}>Serial Number:</Text>
          <Text style={styles.value}>{serialNumber}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.label}>Error:</Text>
          <Text style={styles.errorMessage} numberOfLines={2}>
            {errorMessage}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.button, styles.editButton]} onPress={() => handleEdit(item)}>
            <Icon name="create-outline" size={16} color="#fff" />
            <Text style={styles.buttonText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={() => handleDelete(item)}>
            <Icon name="trash-outline" size={16} color="#fff" />
            <Text style={styles.buttonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Failed Uploads</Text>
      </View>

      {/* Network status indicator */}
      <View style={[styles.networkIndicator, { backgroundColor: isOnline ? "#28a745" : "#dc3545" }]}>
        <Text style={styles.networkText}>
          {isOnline ? "Online - Edits will be uploaded" : "Offline - Edits will be saved locally"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading failed uploads...</Text>
        </View>
      ) : failedUploads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="checkmark-circle" size={64} color="#28a745" />
          <Text style={styles.emptyText}>No failed uploads found</Text>
        </View>
      ) : (
        <FlatList
          data={failedUploads}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.account_id}`}
          contentContainerStyle={styles.listContent}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    width: "100%",
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
  networkIndicator: {
    padding: 8,
    alignItems: "center",
    width: "100%",
  },
  networkText: {
    color: "white",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    width: "100%",
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    color: "#666",
  },
  listContent: {
    padding: 16,
    width: "100%",
  },
  itemContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    width: "100%",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    width: "100%",
  },
  accountId: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  duplicateStatus: {
    backgroundColor: "#ff9800",
  },
  errorStatus: {
    backgroundColor: "#dc3545",
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 8,
    width: "100%",
  },
  label: {
    width: 100,
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  value: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  errorMessage: {
    flex: 1,
    fontSize: 14,
    color: "#dc3545",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    width: "100%",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginLeft: 8,
  },
  editButton: {
    backgroundColor: "#007AFF",
  },
  deleteButton: {
    backgroundColor: "#dc3545",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
})

export default FailedUploadsScreen
