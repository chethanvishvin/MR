"use client"

import { createContext, useState, useContext, useEffect } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { initializeBackgroundServices } from "../utils/backgroundService"
import { syncMeterSerialNumbers } from "../utils/syncService"

export const AuthContext = createContext({
  isLoading: true,
  userToken: null,
  userName: null,
  userId: null,
  userType: null,
  isLoggedIn: false,
  login: async () => false,
  logout: async () => false,
  checkSessionExpiry: async () => false,
})

const SESSION_TIMEOUT = 23 * 60 * 60 * 1000 // 23 hours in milliseconds

export const AuthProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [userToken, setUserToken] = useState(null)
  const [userName, setUserName] = useState(null)
  const [userId, setUserId] = useState(null)
  const [userType, setUserType] = useState(null)
  const [backgroundServicesCleanup, setBackgroundServicesCleanup] = useState(null)

  useEffect(() => {
    const bootstrapAsync = async () => {
      console.log("Checking authentication state...")
      try {
        setIsLoading(true)

        // Load auth data from AsyncStorage first
        const [token, name, id, type] = await Promise.all([
          AsyncStorage.getItem("userToken"),
          AsyncStorage.getItem("userName"),
          AsyncStorage.getItem("userId"),
          AsyncStorage.getItem("userType"),
        ])

        console.log(`Auth check - Token exists: ${!!token}, User ID exists: ${!!id}, User Type: ${type}`)

        // If we have a token and user ID, check session expiry
        if (token && id) {
          // Only remove the logout flag if we're restoring a session
          await AsyncStorage.removeItem("userLoggedOut")

          const isSessionExpired = await checkSessionExpiry()

          if (!isSessionExpired) {
            console.log("User is authenticated, restoring session")
            setUserToken(token)
            setUserName(name || "")
            setUserId(id)
            setUserType(type || "")

            // Start background services since user is logged in
            console.log("🔐 User is authenticated, starting background services...")
            try {
              const cleanup = initializeBackgroundServices()
              setBackgroundServicesCleanup(() => cleanup)

              // Perform immediate sync after authentication restore
              console.log("🔄 Performing immediate sync after authentication restore...")
              setTimeout(async () => {
                try {
                  await syncMeterSerialNumbers(true, false)
                } catch (error) {
                  console.error("Error in immediate sync after auth restore:", error)
                }
              }, 2000)
            } catch (error) {
              console.error("Error starting background services:", error)
            }
          }
        } else {
          console.log("No authentication data found")
        }
      } catch (error) {
        console.error("Error restoring authentication state:", error)
      } finally {
        setIsLoading(false)
      }
    }

    bootstrapAsync()

    const sessionCheckInterval = setInterval(
      () => {
        if (userToken && userId) {
          checkSessionExpiry()
        }
      },
      15 * 60 * 1000,
    )

    return () => {
      if (backgroundServicesCleanup) {
        try {
          backgroundServicesCleanup()
        } catch (error) {
          console.error("Error cleaning up background services:", error)
        }
      }
      clearInterval(sessionCheckInterval)
    }
  }, [])

  const login = async (token, name, id, type) => {
    console.log("Logging in user:", id, "Type:", type)
    try {
      const loginTimestamp = Date.now().toString()

      await Promise.all([
        AsyncStorage.setItem("userToken", token),
        AsyncStorage.setItem("userName", name || ""),
        AsyncStorage.setItem("userId", id.toString()),
        AsyncStorage.setItem("userType", type || ""),
        AsyncStorage.setItem("loginTimestamp", loginTimestamp),
        AsyncStorage.removeItem("userLoggedOut"),
      ])

      setUserToken(token)
      setUserName(name || "")
      setUserId(id)
      setUserType(type || "")

      console.log("🔐 User logged in successfully, starting background services...")
      try {
        const cleanup = initializeBackgroundServices()
        setBackgroundServicesCleanup(() => cleanup)

        console.log("🔄 Performing immediate sync after login...")
        setTimeout(async () => {
          try {
            console.log("🔄 Starting immediate meter serial sync...")
            const syncResult = await syncMeterSerialNumbers(true, false)
            console.log("🔄 Immediate sync result:", syncResult)
          } catch (error) {
            console.error("Error in immediate sync after login:", error)
          }
        }, 3000)
      } catch (error) {
        console.error("Error starting background services:", error)
      }

      console.log("Login successful, credentials stored")
      return true
    } catch (error) {
      console.error("Error during login:", error)
      return false
    }
  }

  const checkSessionExpiry = async () => {
    try {
      const loginTimestamp = await AsyncStorage.getItem("loginTimestamp")

      if (loginTimestamp) {
        const loginTime = Number.parseInt(loginTimestamp, 10)
        const currentTime = Date.now()
        const sessionAge = currentTime - loginTime

        if (sessionAge >= SESSION_TIMEOUT) {
          console.log("Session expired after 23 hours, logging out user")
          await logout()
          return true
        }
      }
      return false
    } catch (error) {
      console.error("Error checking session expiry:", error)
      return false
    }
  }

  const logout = async () => {
    console.log("Logging out user")
    try {
      console.log("🔐 User logging out, stopping background services...")
      if (backgroundServicesCleanup) {
        try {
          backgroundServicesCleanup()
          setBackgroundServicesCleanup(null)
        } catch (error) {
          console.error("Error stopping background services:", error)
        }
      }

      await AsyncStorage.setItem("userLoggedOut", "true")
      await AsyncStorage.multiRemove(["userToken", "userName", "userId", "userType", "loginTimestamp"])

      setUserToken(null)
      setUserName(null)
      setUserId(null)
      setUserType(null)

      console.log("Logout successful, credentials cleared")
      return true
    } catch (error) {
      console.error("Error during logout:", error)
      return false
    }
  }

  const authContext = {
    isLoading,
    userToken,
    userName,
    userId,
    userType,
    login,
    logout,
    isLoggedIn: !!userToken && !!userId,
    checkSessionExpiry,
  }

  return <AuthContext.Provider value={authContext}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  return useContext(AuthContext)
}