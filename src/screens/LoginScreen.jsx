"use client"

import { useState, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  StatusBar,
  Dimensions,
  ScrollView,
} from "react-native"
import { useAuth } from "../context/AuthContext"
import { SafeAreaView } from "react-native-safe-area-context"
import Footer from "../components/Footer"
import AsyncStorage from "@react-native-async-storage/async-storage"

const { width, height } = Dimensions.get("window")

const LoginScreen = ({ navigation }) => {
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [welcomeMessage, setWelcomeMessage] = useState("Welcome")

  const { login, isLoggedIn } = useAuth()

  useEffect(() => {
    if (isLoggedIn) {
      navigation.replace("MainTabs")
    }
  }, [isLoggedIn, navigation])

  useEffect(() => {
    const checkWelcomeMessage = async () => {
      try {
        // Check if user actively logged out
        const userLoggedOut = await AsyncStorage.getItem("userLoggedOut")

        if (userLoggedOut === "true") {
          setWelcomeMessage("Welcome Back")
        } else {
          setWelcomeMessage("Welcome")
        }
      } catch (error) {
        console.log("Error checking welcome message:", error)
        setWelcomeMessage("Welcome")
      }
    }

    checkWelcomeMessage()
  }, [])

  const handleLogin = async () => {
    if (!phone.trim()) {
      Alert.alert("Error", "Please enter your phone number")
      return
    }

    if (!password) {
      Alert.alert("Error", "Please enter your password")
      return
    }

    setIsLoading(true)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch("https://gescom.vishvin.com/api/fe/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, password }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Login failed with status ${response.status}: ${errorText}`)
        throw new Error(`Server returned ${response.status}: ${errorText || "Unknown error"}`)
      }

      const data = await response.json()

      if (data.success) {
        // Check if user type is field_executive
        if (data.data.type !== "field_executive") {
          Alert.alert(
            "Access Denied",
            "Only field executives are allowed to use this app. Please contact your administrator.",
          )
          return
        }

        console.log("Login successful, storing credentials...")
        const loginSuccess = await login(
          data.data.token,
          data.data.name || "",
          (data.data.id || "0").toString(),
          data.data.type || "",
        )

        if (loginSuccess) {
          console.log("Login successful:", data.message)
          navigation.replace("MainTabs")
        } else {
          Alert.alert("Login Error", "Failed to store login information. Please try again.")
        }
      } else {
        Alert.alert("Login Failed", data.message || "Invalid credentials")
      }
    } catch (error) {
      console.error("Login error:", error)
      if (error.name === "AbortError") {
        Alert.alert("Login Error", "Request timed out. Please try again.")
      } else if (error.message.includes("Network request failed")) {
        Alert.alert(
          "Login Error",
          "Failed to connect to the server. Please check your internet connection and try again.",
        )
      } else {
        Alert.alert("Login Error", "An unexpected error occurred. Please try again later.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollViewContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoContainer}>
            <Image source={require("../../assets/vishlogo.png")} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.welcomeText}>{welcomeMessage}</Text>
            <Text style={styles.subText}>Sign In to Continue.</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Phone *required</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Password *required</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor="#999"
              />
            </View>

            <TouchableOpacity
              style={[styles.signInButton, isLoading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.signInButtonText}>Sign in</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.contactText}>Don't have an account? Contact Contractor</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.versionContainer}>
        <Text style={styles.version}>Version 2.0.5</Text>
      </View>
      <Footer />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    width: "100%",
  },
  keyboardAvoidingView: {
    flex: 1,
    width: "100%",
  },
  logoContainer: {
    alignItems: "center",
    marginTop: 60,
    marginBottom: 20,
    width: "100%",
  },
  logo: {
    width: 150,
    height: 60,
  },
  formContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 4,
  },
  subText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
    width: "100%",
  },
  inputLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  input: {
    height: 50,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#333",
    width: "100%",
  },
  signInButton: {
    backgroundColor: "#00BCD4",
    height: 50,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
    width: "100%",
  },
  disabledButton: {
    backgroundColor: "#B2EBF2",
  },
  signInButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  contactText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  version: {
    fontSize: 18,
    color: "#666",
    textAlign: "center",
    fontWeight: "bold",
  },
  versionContainer: {
    position: "absolute",
    bottom: height * 0.05,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 20,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: height * 0.15,
  },
})

export default LoginScreen
