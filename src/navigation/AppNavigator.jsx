"use client";

import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaView } from "react-native-safe-area-context";
import LoginScreen from "../screens/LoginScreen";
import TabNavigatorWithProvider from "./BottomTabNavigator"; // ✅ Correct component
import AddMeterScreen from "../screens/AddMeterScreen";
import CustomerSearchScreen from "../screens/CustomerSearchScreen";
import OldMeterScreen from "../screens/OldMeterScreen";
import NewMeterScreen from "../screens/NewMeterScreen";
import FailedUploadsScreen from "../screens/FailedUploadsScreen";
import { useAuth } from "../context/AuthContext";

const Stack = createStackNavigator();

const AppNavigator = () => {
  const { isLoggedIn } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: "#f5f5f5" },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            cardStyle: { backgroundColor: "#f5f5f5" },
          }}
        />

        {isLoggedIn && (
          <>
            <Stack.Screen
              name="MainTabs"
              component={TabNavigatorWithProvider} // ✅ Use the correct wrapper
            />
            <Stack.Screen name="AddMeter" component={AddMeterScreen} />
            <Stack.Screen name="CustomerSearch" component={CustomerSearchScreen} />
            <Stack.Screen name="OldMeter" component={OldMeterScreen} />
            <Stack.Screen name="NewMeter" component={NewMeterScreen} />
            <Stack.Screen name="FailedUploads" component={FailedUploadsScreen} />
          </>
        )}
      </Stack.Navigator>
    </SafeAreaView>
  );
};

export default AppNavigator;
