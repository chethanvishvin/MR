import React, { useEffect } from "react";
import { StatusBar, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./navigation/AppNavigator";
import { AuthProvider } from "./context/AuthContext";
import SplashScreen from "react-native-splash-screen";
import { enableScreens } from "react-native-screens";
import AndroidStatusBarSafeView from "./components/AndroidStatusBarSafeView"
enableScreens();

const App = () => {
  useEffect(() => {
    // Hide splash screen when app is ready
    SplashScreen.hide();
  }, []);

  return (
    <SafeAreaProvider>
    <AndroidStatusBarSafeView>
      <View style={styles.container}>
        <AuthProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </View>
    </AndroidStatusBarSafeView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
