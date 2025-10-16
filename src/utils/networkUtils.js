import NetInfo from "@react-native-community/netinfo"

// API base URL
export const API_BASE_URL = "https://gescom.vishvin.com/api"

// Check internet connection with timeout and actual server ping
export const checkInternetConnection = async () => {
  try {
    // First check NetInfo state
    const state = await NetInfo.fetch()
    console.log("Network state:", JSON.stringify(state, null, 2))

    if (!state.isConnected) {
      console.log("NetInfo reports no connection")
      return false
    }

    // Even if NetInfo says we're connected, we need to verify actual server connectivity
    try {
      // Try to ping our actual API server with a short timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${API_BASE_URL}/ping`, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-cache",
      }).catch(async (error) => {
        // If the ping endpoint fails, try a general connectivity check
        console.log("API ping failed, trying general connectivity check")
        const googleResponse = await fetch("https://www.google.com", {
          method: "HEAD",
          signal: controller.signal,
          cache: "no-cache",
        })
        return googleResponse
      })

      clearTimeout(timeoutId)

      // If we get here, we have connectivity to either our API or Google
      console.log("Internet connection verified with actual server ping")
      return true
    } catch (fetchError) {
      console.log("Server connectivity check failed:", fetchError.message)
      // If both checks fail, we're definitely offline
      return false
    }
  } catch (error) {
    console.error("Error checking internet connection:", error)
    return false
  }
}

// Fetch with timeout and retry
export const fetchWithTimeout = async (url, options = {}, timeout = 30000, retries = 2) => {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), timeout)

      console.log(`Fetch attempt ${attempt + 1}/${retries + 1} for ${url}`)

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(id)
      return response
    } catch (error) {
      console.error(`Fetch attempt ${attempt + 1} failed:`, error)
      lastError = error

      // If this wasn't the last attempt, wait before retrying
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt) // Exponential backoff
        console.log(`Waiting ${delay}ms before retry...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError || new Error("Failed to fetch after retries")
}

export default {
  checkInternetConnection,
  fetchWithTimeout,
  API_BASE_URL,
}
