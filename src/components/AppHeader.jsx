"use client"

import { useState, useEffect } from "react"
import { View, Text, Image, StyleSheet } from "react-native"
import NetInfo from "@react-native-community/netinfo"
import Icon from "react-native-vector-icons/Ionicons"

const AppHeader = ({ customRightContent }) => {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected && state.isInternetReachable)
    })

    return () => unsubscribe()
  }, [])

  return (
    <View style={styles.headerContainer}>
      <View style={styles.logoWrapper}>
        <Image
          source={require("../assets/background.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.centerContent}>
        <View style={[styles.statusIndicator, { backgroundColor: isOnline ? "#28a745" : "#dc3545" }]}>
          <Icon name={isOnline ? "wifi" : "wifi-off"} size={14} color="#FFFFFF" />
          <Text style={styles.statusText}>{isOnline ? "Online" : "Offline"}</Text>
        </View>
      </View>

      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>V 2.0.5</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    height: 60, // fixed header height
    paddingHorizontal: 10,
  },
  logoWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  logo: {
    width: "100%",  // stretches to fill available width
    height: "100%", // fills full height of header
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  versionContainer: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  versionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 4,
  },
})

export default AppHeader
