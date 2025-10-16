import { View, TouchableOpacity, Text } from "react-native"
import React from "react"

// Safe function execution wrapper
export const safeExecute = async (func, fallbackValue = null, errorCallback = null) => {
  try {
    return await func()
  } catch (error) {
    console.error("Error in safeExecute:", error)
    if (errorCallback && typeof errorCallback === "function") {
      errorCallback(error)
    }
    return fallbackValue
  }
}

// Simple error logger
export const logError = (component, method, error) => {
  console.error(`Error in ${component}.${method}:`, error)
  console.error("Stack:", error.stack)
}

// Safe component method wrapper for class components
export const withErrorBoundary = (Component) => {
  return class ErrorBoundary extends React.Component {
    state = { hasError: false, error: null }

    static getDerivedStateFromError(error) {
      return { hasError: true, error }
    }

    componentDidCatch(error, info) {
      console.error("Component error caught:", error)
      console.log("Component stack:", info.componentStack)
    }

    render() {
      if (this.state.hasError) {
        return (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>Something went wrong</Text>
            <Text style={{ textAlign: "center", marginBottom: 20 }}>
              The app encountered an error. Please try again.
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: "#007AFF",
                padding: 12,
                borderRadius: 8,
              }}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )
      }

      return <Component {...this.props} />
    }
  }
}

