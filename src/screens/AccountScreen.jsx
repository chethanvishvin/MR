
"use client"

import { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import Footer from "../components/Footer"

import Ionicons from "react-native-vector-icons/Ionicons"
import { uploadPendingData } from "../utils/apiService"
import { getDatabaseStats } from "../utils/databaseUtils"
import NetInfo from "@react-native-community/netinfo"
import { syncMeterSerialNumbers, addSyncListener, removeSyncListener, getLastSyncError } from "../utils/syncService"
import { useAuth } from "../context/AuthContext"
import AppHeader from "../components/AppHeader"
import AndroidStatusBarSafeView from "../components/AndroidStatusBarSafeView"

const AccountScreen = ({ navigation }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSyncingMeterSerials, setIsSyncingMeterSerials] = useState(false)
  const [pendingRecords, setPendingRecords] = useState({ old: 0, new: 0 })
  const [networkStatus, setNetworkStatus] = useState(null)
  const [syncStatus, setSyncStatus] = useState("idle") // idle, syncing, success, error
  const [syncError, setSyncError] = useState(null)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [lastMeterSyncTime, setLastMeterSyncTime] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0) // Used to force re-render
  const [showSyncResultsModal, setShowSyncResultsModal] = useState(false)
  const [showFailedUploadsModal, setShowFailedUploadsModal] = useState(false)
  const [syncResults, setSyncResults] = useState(null)
  const [allFailedUploads, setAllFailedUploads] = useState([])
  const [syncProgress, setSyncProgress] = useState("")

  const { userName, userId, logout } = useAuth()

  // Create a memoized function to check pending records
  const checkPendingRecords = useCallback(async () => {
    try {
      const stats = await getDatabaseStats()
      console.log("Database stats:", stats)
      setPendingRecords({
        old: stats.oldMeterPending || 0,
        new: stats.newMeterPending || 0,
      })
      return stats
    } catch (error) {
      console.error("Error checking pending records:", error)
      return { oldMeterPending: 0, newMeterPending: 0 }
    }
  }, [])

  useEffect(() => {
    checkPendingRecords()
    checkNetworkStatus()

    // Force immediate sync when account screen loads
    const forceSync = async () => {
      try {
        console.log("🔄 AccountScreen: Forcing immediate sync...")
        const { forceImmediateSync } = require("../utils/backgroundService")
        await forceImmediateSync()
      } catch (error) {
        console.error("Error forcing sync from AccountScreen:", error)
      }
    }

    // Trigger sync after a short delay
    setTimeout(forceSync, 1000)

    // Set up network status listener
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkStatus(state)
    })

    // Set up a timer to periodically check for pending records
    const timer = setInterval(() => {
      checkPendingRecords()
      setRefreshKey((prev) => prev + 1) // Force re-render
    }, 30000) // every 30 seconds

    // Set up sync listener
    const syncListener = (status, error) => {
      console.log("Sync status changed:", status, error)
      if (status === "started") {
        setIsSyncing(true)
        setSyncStatus("syncing")
        setSyncError(null)
      } else if (status === "succeeded") {
        setIsSyncing(false)
        setSyncStatus("success")
        setSyncError(null)
        setLastSyncTime(new Date())
        // Refresh pending records after successful sync
        checkPendingRecords()
      } else if (status === "failed") {
        setIsSyncing(false)
        setSyncStatus("error")
        setSyncError(error || "Unknown error")
      } else if (status === "skipped") {
        setIsSyncing(false)
      }
    }

    addSyncListener(syncListener)

    // Check for existing sync error
    const existingError = getLastSyncError()
    if (existingError) {
      setSyncStatus("error")
      setSyncError(existingError)
    }

    return () => {
      unsubscribe()
      clearInterval(timer)
      removeSyncListener(syncListener)
    }
  }, [checkPendingRecords])

  const checkNetworkStatus = async () => {
    try {
      const state = await NetInfo.fetch()
      setNetworkStatus(state)
    } catch (error) {
      console.error("Error checking network status:", error)
    }
  }

  const handleLogout = async () => {
    Alert.alert("Confirm Logout", "Are you sure you want to log out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: performLogout,
      },
    ])
  }

  const performLogout = async () => {
    setIsLoading(true)
    try {
      // Check if there are pending records
      const stats = await checkPendingRecords()
      const hasPendingRecords = stats.oldMeterPending > 0 || stats.newMeterPending > 0

      if (hasPendingRecords) {
        Alert.alert(
          "Pending Data",
          `You have ${stats.oldMeterPending + stats.newMeterPending} pending records that haven't been uploaded. Do you want to sync before logging out?`,
          [
            {
              text: "Sync & Logout",
              onPress: async () => {
                await handleDataSync()
                await logout()
              },
            },
            {
              text: "Logout Anyway",
              style: "destructive",
              onPress: async () => {
                await logout()
              },
            },
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => setIsLoading(false),
            },
          ],
        )
      } else {
        await logout()
      }
    } catch (error) {
      console.error("Error during logout process:", error)
      Alert.alert("Error", "Failed to log out. Please try again.")
      setIsLoading(false)
    }
  }

  const handleAuthenticationError = () => {
    Alert.alert("Authentication Error", "Your session has expired. Please log in again.", [
      {
        text: "Login Again",
        onPress: async () => {
          await logout()
        },
      },
    ])
  }

  const handleMeterSerialSync = async () => {
    if (isSyncingMeterSerials || isSyncing) return

    // Check network status first
    if (!networkStatus?.isConnected) {
      Alert.alert("No Connection", "Please check your internet connection and try again.")
      return
    }

    setIsSyncingMeterSerials(true)

    try {
      console.log("🔄 Starting meter serial numbers sync...")
      const result = await syncMeterSerialNumbers(true, true)
      console.log("🔄 Meter serial sync result:", result)

      if (result.success) {
        const message = result.skipped
          ? "Meter sync skipped (recent sync)"
          : `Successfully synced ${result.saved || 0} meter serial numbers from ${result.contractors || 0} contractors (${result.totalAvailable || 0} total available)`

        Alert.alert("Meter Serial Sync Complete", message)
        setLastMeterSyncTime(new Date())
      } else if (result.offline) {
        Alert.alert("Offline Mode", "This is offline contractor information")
      } else {
        const errorMsg = result.error || "Failed to sync meter serial numbers"
        Alert.alert("Meter Serial Sync Failed", errorMsg)

        // Check for authentication error
        if (errorMsg.includes("401") || errorMsg.toLowerCase().includes("authentication")) {
          handleAuthenticationError()
          return
        }
      }
    } catch (error) {
      console.error("Error during meter serial sync:", error)

      // Check if it's an authentication error
      if (error.message && error.message.includes("401")) {
        handleAuthenticationError()
        return
      }

      Alert.alert("Sync Error", "An error occurred during meter serial synchronization: " + error.message)
    } finally {
      setIsSyncingMeterSerials(false)
    }
  }

  const handleDataSync = async () => {
    if (isSyncing || isSyncingMeterSerials) return

    // Check network status first
    if (!networkStatus?.isConnected) {
      Alert.alert("No Connection", "Please check your internet connection and try again.")
      return
    }

    setIsSyncing(true)
    setSyncStatus("syncing")
    setSyncError(null)
    setSyncResults(null)
    setAllFailedUploads([])
    setSyncProgress("Initializing sync...")

    try {
      // Only sync pending meter data (not meter serial numbers)
      console.log("📤 Starting upload of pending meter data...")
      setSyncProgress("Preparing data for upload...")

      // Check if uploadPendingData function exists
      if (typeof uploadPendingData !== "function") {
        throw new Error("uploadPendingData function is not available")
      }

      setSyncProgress("Uploading data to server...")
      const result = await uploadPendingData()
      console.log("📤 Upload result:", result)

      // Check for authentication errors
      const hasAuthError =
        (result.oldMeterFailures && result.oldMeterFailures.some((failure) => failure.status === 401)) ||
        (result.newMeterFailures && result.newMeterFailures.some((failure) => failure.status === 401))

      if (hasAuthError) {
        setIsSyncing(false)
        setSyncProgress("")
        handleAuthenticationError()
        return
      }

      // Store the sync results for detailed view
      setSyncResults(result)

      // Prepare failed uploads data for the modal
      const failedUploads = []

      // Process old meter failures
      if (result.oldMeterFailures && result.oldMeterFailures.length > 0) {
        result.oldMeterFailures.forEach((failure) => {
          // Extract account ID from various possible sources
          let accountId = "Unknown"
          if (failure.accountId) {
            accountId = failure.accountId
          } else if (failure.account_id) {
            accountId = failure.account_id
          } else if (failure.data && failure.data.account_id) {
            accountId = failure.data.account_id
          } else if (failure.originalData && failure.originalData.account_id) {
            accountId = failure.originalData.account_id
          }

          failedUploads.push({
            id: failure.id,
            accountId: accountId,
            screenType: "Old Meter",
            serialNumber:
              failure.serialNumber || failure.data?.serial_no_old || failure.originalData?.serial_no_old || "N/A",
            errorType: getErrorType(failure),
            errorMessage: getErrorMessage(failure),
            status: failure.status || "Unknown",
            isDuplicateError: failure.isDuplicateError || false,
            isStorageError: failure.isStorageError || false,
            isAuthError: failure.status === 401,
            isServerError: failure.status === 500,
          })
        })
      }

      // Process new meter failures
      if (result.newMeterFailures && result.newMeterFailures.length > 0) {
        result.newMeterFailures.forEach((failure) => {
          // Extract account ID from various possible sources
          let accountId = "Unknown"
          if (failure.accountId) {
            accountId = failure.accountId
          } else if (failure.account_id) {
            accountId = failure.account_id
          } else if (failure.data && failure.data.account_id) {
            accountId = failure.data.account_id
          } else if (failure.originalData && failure.originalData.account_id) {
            accountId = failure.originalData.account_id
          }

          failedUploads.push({
            id: failure.id,
            accountId: accountId,
            screenType: "New Meter",
            serialNumber:
              failure.serialNumber || failure.data?.serial_no_new || failure.originalData?.serial_no_new || "N/A",
            errorType: getErrorType(failure),
            errorMessage: getErrorMessage(failure),
            status: failure.status || "Unknown",
            isDuplicateError: failure.isDuplicateError || false,
            isStorageError: failure.isStorageError || false,
            isAuthError: failure.status === 401,
            isServerError: failure.status === 500,
          })
        })
      }

      setAllFailedUploads(failedUploads)

      if (result.success) {
        const totalUploaded = result.oldMeterUploaded + result.newMeterUploaded
        const totalFailed = failedUploads.length

        setSyncProgress("Sync completed successfully!")

        if (totalFailed > 0) {
          // Show success message with option to view failures
          Alert.alert(
            "Data Sync Completed",
            `Successfully uploaded ${totalUploaded} records.\n${totalFailed} records failed to upload.`,
            [
              {
                text: "View Failed Uploads",
                onPress: () => setShowFailedUploadsModal(true),
              },
              {
                text: "OK",
                style: "default",
              },
            ],
          )
        } else {
          Alert.alert(
            "Data Sync Complete",
            `Successfully uploaded ${result.oldMeterUploaded} old meter records and ${result.newMeterUploaded} new meter records.`,
          )
        }

        setSyncStatus("success")
        setLastSyncTime(new Date())
      } else {
        setSyncProgress("Sync failed!")
        // Show error with option to view details
        Alert.alert("Data Sync Failed", result.error || "Failed to sync meter data", [
          {
            text: "View Details",
            onPress: () => setShowSyncResultsModal(true),
          },
          {
            text: "OK",
            style: "default",
          },
        ])
        setSyncStatus("error")
        setSyncError(result.error || "Failed to sync meter data")
      }

      // Refresh pending records count immediately
      await checkPendingRecords()
    } catch (error) {
      console.error("Error during data sync:", error)
      setSyncProgress("Sync failed with error!")

      // Check if it's an authentication error
      if (error.message && error.message.includes("401")) {
        handleAuthenticationError()
        return
      }

      Alert.alert("Data Sync Failed", error.message || "An error occurred during data synchronization.", [
        {
          text: "View Details",
          onPress: () => {
            setSyncError(error.message || "An error occurred during data synchronization")
            setShowSyncResultsModal(true)
          },
        },
        {
          text: "OK",
          style: "default",
        },
      ])
      setSyncStatus("error")
      setSyncError(error.message || "An error occurred during data synchronization")
    } finally {
      setIsSyncing(false)
      setSyncProgress("")
    }
  }

  const getErrorType = (failure) => {
    if (failure.status === 401) return "Authentication Error"
    if (failure.status === 500) return "Server Error"
    if (failure.isDuplicateError) return "Duplicate"
    if (failure.isStorageError) return "Storage Error"
    if (failure.status === 422) return "Validation Error"
    return "Error"
  }

  const getErrorMessage = (failure) => {
    if (failure.status === 401) {
      return "Authentication failed. Please log in again."
    }
    if (failure.status === 500) {
      return "Internal server error. Please try again later."
    }
    if (failure.isDuplicateError) {
      return `Serial number already exists in the system`
    }
    if (failure.isStorageError) {
      return "Server file storage system is not properly configured"
    }
    if (failure.data && failure.data.message) {
      return failure.data.message
    }
    return failure.error || "Unknown error occurred"
  }

  const renderFailedUploadItem = ({ item }) => {
    const getStatusColor = () => {
      if (item.isAuthError) return "#dc3545"
      if (item.isServerError) return "#6f42c1"
      if (item.isDuplicateError) return "#ff9800"
      if (item.isStorageError) return "#8a2be2"
      return "#dc3545"
    }

    const getStatusIcon = () => {
      if (item.isAuthError) return "lock-closed"
      if (item.isServerError) return "server"
      if (item.isDuplicateError) return "alert-circle"
      if (item.isStorageError) return "server-outline"
      return "close-circle"
    }

    return (
      <View style={styles.failedUploadItem}>
        <View style={styles.failedUploadHeader}>
          <View style={styles.failedUploadInfo}>
            <Text style={styles.failedUploadAccountId}>Account ID: {item.accountId}</Text>
            <Text style={styles.failedUploadScreenType}>{item.screenType}</Text>
          </View>
          <View style={[styles.failedUploadStatus, { backgroundColor: getStatusColor() }]}>
            <Ionicons name={getStatusIcon()} size={16} color="#fff" />
            <Text style={styles.failedUploadStatusText}>{item.errorType}</Text>
          </View>
        </View>

        <View style={styles.failedUploadDetails}>
          <Text style={styles.failedUploadLabel}>Serial Number:</Text>
          <Text style={styles.failedUploadValue}>{item.serialNumber}</Text>
        </View>

        <View style={styles.failedUploadDetails}>
          <Text style={styles.failedUploadLabel}>Reason:</Text>
          <Text style={styles.failedUploadError}>{item.errorMessage}</Text>
        </View>

        {item.status && (
          <View style={styles.failedUploadDetails}>
            <Text style={styles.failedUploadLabel}>Status Code:</Text>
            <Text style={styles.failedUploadValue}>{item.status}</Text>
          </View>
        )}

        {item.isAuthError && (
          <TouchableOpacity style={styles.loginAgainButton} onPress={handleAuthenticationError}>
            <Ionicons name="log-in-outline" size={16} color="#fff" />
            <Text style={styles.loginAgainText}>Login Again</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const renderSyncResultItem = ({ item }) => {
    const isDuplicateError =
      item.isDuplicateError ||
      (item.data &&
        item.data.message &&
        (item.data.message.toLowerCase().includes("already exists") ||
          item.data.message.toLowerCase().includes("already been taken") ||
          item.data.message.toLowerCase().includes("account already installed"))) ||
      (item.error &&
        (item.error.toLowerCase().includes("already exists") ||
          item.error.toLowerCase().includes("already been taken") ||
          item.error.toLowerCase().includes("account already installed")))

    const isStorageError =
      item.isStorageError ||
      item.status === 500 ||
      (item.error &&
        (item.error.toLowerCase().includes("disk") ||
          item.error.toLowerCase().includes("upload") ||
          item.error.toLowerCase().includes("driver"))) ||
      (item.data &&
        item.data.message &&
        (item.data.message.toLowerCase().includes("disk") ||
          item.data.message.toLowerCase().includes("upload") ||
          item.data.message.toLowerCase().includes("driver")))

    const isAuthError = item.status === 401
    const isServerError = item.status === 500

    return (
      <View style={styles.errorItem}>
        <View style={styles.errorHeader}>
          <Ionicons
            name={
              isAuthError
                ? "lock-closed"
                : isServerError
                  ? "server"
                  : isDuplicateError
                    ? "alert-circle"
                    : isStorageError
                      ? "server-outline"
                      : "close-circle"
            }
            size={20}
            color={
              isAuthError
                ? "#dc3545"
                : isServerError
                  ? "#6f42c1"
                  : isDuplicateError
                    ? "#ff9800"
                    : isStorageError
                      ? "#8a2be2"
                      : "#dc3545"
            }
          />
          <Text style={styles.errorTitle}>
            {isAuthError
              ? "Authentication Error"
              : isServerError
                ? `Server Error (${item.status || "500"})`
                : isDuplicateError
                  ? "Duplicate Serial Number"
                  : isStorageError
                    ? `Server Storage Error (${item.status || "Unknown"})`
                    : `Error (${item.status || "Unknown"})`}
          </Text>
        </View>
        <Text style={styles.errorMessage}>
          {isAuthError
            ? "Authentication failed. Please log in again."
            : isServerError
              ? "Internal server error. Please try again later."
              : isDuplicateError
                ? `Serial number ${item.serialNumber || ""} already exists in the system.`
                : isStorageError
                  ? "Server file storage system is not properly configured."
                  : item.error || "Unknown error"}
        </Text>
        {item.data && item.data.message && <Text style={styles.errorDetails}>{item.data.message}</Text>}
        {item.data && item.data.serial_no_new && Array.isArray(item.data.serial_no_new) && (
          <Text style={styles.errorDetails}>{item.data.serial_no_new.join(", ")}</Text>
        )}
      </View>
    )
  }

  return (
    <AndroidStatusBarSafeView backgroundColor="#F5F5F5">
      <AppHeader />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Account</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.container}>
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              <Ionicons name="person-circle-outline" size={120} color="#6C757D" />
            </View>
            <Text style={styles.name}>{userName || "Field Executive"}</Text>
            <Text style={styles.role}>Field Executive</Text>
            <Text style={styles.userId}>ID: {userId || "N/A"}</Text>
          </View>

          {/* Network Status Indicator */}
          <View
            style={[styles.networkIndicator, { backgroundColor: networkStatus?.isConnected ? "#28a745" : "#dc3545" }]}
          >
            <Text style={styles.networkText}>
              {networkStatus?.isConnected ? `Online (${networkStatus.type})` : "Offline - Connect to sync data"}
            </Text>
          </View>

          {/* Sync Status */}
          {syncStatus === "error" && syncError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#fff" />
              <Text style={styles.errorText}>Error syncing: {syncError}</Text>
            </View>
          )}

          {/* Sync Progress */}
          {syncProgress && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>{syncProgress}</Text>
            </View>
          )}

          {/* Last Sync Times */}
          {lastSyncTime && (
            <View style={styles.lastSyncContainer}>
              <Text style={styles.lastSyncText}>Last data sync: {lastSyncTime.toLocaleTimeString()}</Text>
            </View>
          )}

          {lastMeterSyncTime && (
            <View style={styles.lastSyncContainer}>
              <Text style={styles.lastSyncText}>
                Last meter serial sync: {lastMeterSyncTime.toLocaleTimeString()}
              </Text>
            </View>
          )}

          {/* Pending Records Count */}
          <View style={styles.pendingContainer}>
            <Text style={styles.pendingText}>
              Pending records: {pendingRecords.old + pendingRecords.new}
              {pendingRecords.old + pendingRecords.new > 0
                ? ` (${pendingRecords.old} old meter, ${pendingRecords.new} new meter)`
                : ""}
            </Text>
          </View>

          {/* Sync Meter Serial Numbers Button */}
          <TouchableOpacity
            style={[
              styles.syncMeterButton,
              (!networkStatus?.isConnected || isSyncingMeterSerials || isSyncing) && styles.disabledButton,
            ]}
            onPress={handleMeterSerialSync}
            disabled={isSyncingMeterSerials || isSyncing || !networkStatus?.isConnected}
          >
            {isSyncingMeterSerials ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="hardware-chip-outline" size={24} color="#FFFFFF" />
                <Text style={styles.syncText}>Sync Meter Serial Numbers</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Sync All Data Button */}
          <TouchableOpacity
            style={[
              styles.syncButton,
              (!networkStatus?.isConnected || isSyncing || isSyncingMeterSerials) && styles.disabledButton,
            ]}
            onPress={handleDataSync}
            disabled={isSyncing || isSyncingMeterSerials || !networkStatus?.isConnected}
          >
            {isSyncing && syncStatus === "syncing" ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={24} color="#FFFFFF" />
                <Text style={styles.syncText}>
                  Sync All Data{" "}
                  {pendingRecords.old + pendingRecords.new > 0
                    ? `(${pendingRecords.old + pendingRecords.new} pending)`
                    : ""}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* View Failed Uploads Button */}
          {allFailedUploads.length > 0 && (
            <TouchableOpacity style={styles.failedUploadsButton} onPress={() => setShowFailedUploadsModal(true)}>
              <Ionicons name="alert-circle-outline" size={24} color="#FFFFFF" />
              <Text style={styles.syncText}>View Failed Uploads ({allFailedUploads.length})</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
                <Text style={styles.logoutText}>Logout</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Add extra padding at the bottom to ensure the logout button isn't covered */}
          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      {/* Failed Uploads Modal */}
      <Modal
        visible={showFailedUploadsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFailedUploadsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={28} color="#dc3545" />
              <Text style={styles.modalTitle}>Failed Uploads ({allFailedUploads.length})</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowFailedUploadsModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {allFailedUploads.length > 0 ? (
                <FlatList
                  data={allFailedUploads}
                  renderItem={renderFailedUploadItem}
                  keyExtractor={(item, index) => `failed-${item.id || index}`}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              ) : (
                <View style={styles.noFailuresContainer}>
                  <Ionicons name="checkmark-circle" size={48} color="#28a745" />
                  <Text style={styles.noFailuresText}>No failed uploads</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowFailedUploadsModal(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sync Results Modal */}
      <Modal
        visible={showSyncResultsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSyncResultsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="information-circle" size={28} color="#007AFF" />
              <Text style={styles.modalTitle}>Sync Results</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowSyncResultsModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {syncResults && (
                <View>
                  <Text style={styles.modalSummary}>
                    Successfully uploaded {syncResults.oldMeterUploaded}/{syncResults.oldMeterTotal} old meter records
                    and {syncResults.newMeterUploaded}/{syncResults.newMeterTotal} new meter records.
                  </Text>

                  {/* Old Meter Failures */}
                  {syncResults.oldMeterFailures && syncResults.oldMeterFailures.length > 0 && (
                    <View style={styles.failureSection}>
                      <Text style={styles.failureSectionTitle}>Old Meter Upload Failures:</Text>
                      <FlatList
                        data={syncResults.oldMeterFailures}
                        renderItem={renderSyncResultItem}
                        keyExtractor={(item, index) => `old-${item.id || index}`}
                        scrollEnabled={false}
                      />
                    </View>
                  )}

                  {/* New Meter Failures */}
                  {syncResults.newMeterFailures && syncResults.newMeterFailures.length > 0 && (
                    <View style={styles.failureSection}>
                      <Text style={styles.failureSectionTitle}>New Meter Upload Failures:</Text>
                      <FlatList
                        data={syncResults.newMeterFailures}
                        renderItem={renderSyncResultItem}
                        keyExtractor={(item, index) => `new-${item.id || index}`}
                        scrollEnabled={false}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Show error message if no sync results but there's an error */}
              {!syncResults && syncError && (
                <View>
                  <Text style={styles.modalSummary}>Sync failed with error:</Text>
                  <Text style={styles.errorMessage}>{syncError}</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSyncResultsModal(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Footer />
    </AndroidStatusBarSafeView>
  )
}

// Update the styles to ensure proper alignment and scrolling
const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    width: "100%",
  },
  scrollViewContent: {
    paddingBottom: 30, // Increased padding to account for the tab bar
    width: "100%",
  },
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    width: "100%",
  },
  header: {
    paddingTop: 8,
    paddingRight: 16,
    paddingLeft: 16,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
    elevation: 2,
    width: "100%",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#212529",
    textAlign: "center",
  },
  profileSection: {
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    marginVertical: 12,
    width: "100%",
  },
  avatarContainer: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 2,
  },
  role: {
    fontSize: 16,
    color: "#6C757D",
    marginBottom: 6,
  },
  userId: {
    fontSize: 14,
    color: "#6C757D",
    marginTop: 4,
  },
  networkIndicator: {
    padding: 6,
    alignItems: "center",
    marginHorizontal: 16,
    borderRadius: 4,
    marginBottom: 12,
    width: "auto",
  },
  networkText: {
    color: "white",
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "#dc3545",
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 4,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  errorText: {
    color: "white",
    marginLeft: 8,
    flex: 1,
  },
  progressContainer: {
    backgroundColor: "#007AFF",
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 4,
    marginBottom: 16,
    alignItems: "center",
  },
  progressText: {
    color: "white",
    fontWeight: "600",
  },
  lastSyncContainer: {
    padding: 6,
    marginHorizontal: 16,
    marginBottom: 6,
    alignItems: "center",
  },
  lastSyncText: {
    color: "#6c757d",
    fontSize: 14,
  },
  pendingContainer: {
    padding: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
  },
  pendingText: {
    color: "#6c757d",
    fontSize: 14,
    fontWeight: "500",
  },
  syncMeterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#28a745",
    padding: 14,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    padding: 14,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  disabledButton: {
    backgroundColor: "#CCCCCC",
  },
  syncText: {
    marginLeft: 12,
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  failedUploadsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9800",
    padding: 14,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF6B6B",
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  logoutText: {
    marginLeft: 12,
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  bottomPadding: {
    height: 20, // Extra padding at the bottom to ensure the logout button isn't covered
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 8,
    width: "95%",
    maxWidth: 500,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginLeft: 8,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  modalScrollView: {
    padding: 16,
    maxHeight: 500,
  },
  modalSummary: {
    fontSize: 16,
    color: "#333",
    marginBottom: 16,
  },
  failureSection: {
    marginBottom: 16,
  },
  failureSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  errorItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#dc3545",
  },
  errorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginLeft: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  errorDetails: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
  },
  modalCloseButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    alignItems: "center",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  modalCloseButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  // Failed Uploads Modal Styles
  failedUploadItem: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  failedUploadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  failedUploadInfo: {
    flex: 1,
  },
  failedUploadAccountId: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 2,
  },
  failedUploadScreenType: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  failedUploadStatus: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  failedUploadStatusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  failedUploadDetails: {
    flexDirection: "row",
    marginBottom: 6,
    alignItems: "flex-start",
  },
  failedUploadLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
    width: 100,
    marginRight: 8,
  },
  failedUploadValue: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  failedUploadError: {
    fontSize: 14,
    color: "#dc3545",
    flex: 1,
    lineHeight: 18,
  },
  noFailuresContainer: {
    alignItems: "center",
    padding: 40,
  },
  noFailuresText: {
    fontSize: 16,
    color: "#666",
    marginTop: 12,
  },
  loginAgainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dc3545",
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  loginAgainText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
})

export default AccountScreen
