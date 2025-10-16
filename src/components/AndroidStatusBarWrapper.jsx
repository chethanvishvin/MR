import { View, StatusBar, Platform } from "react-native"

const AndroidStatusBarWrapper = ({ children, backgroundColor = "#ffffff", style }) => {
  // Only apply padding on Android
  const statusBarHeight = Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0

  return (
    <View
      style={[
        {
          flex: 1,
          
          backgroundColor,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export default AndroidStatusBarWrapper
