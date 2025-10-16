import { View, StyleSheet, Platform, StatusBar } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

/**
 * A container component that handles safe area insets and proper screen padding
 * Use this as a wrapper for your screen content to ensure proper spacing
 */
const ScreenContainer = ({ children, style }) => {
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.container,
        {
          // Add padding for the status bar on Android
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : insets.top,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
})

export default ScreenContainer
