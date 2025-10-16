import React from "react";
import { View, StatusBar, Platform } from "react-native";

const AndroidStatusBarSafeView = ({ children, backgroundColor = "#ffffff", barStyle = "dark-content" }) => {
  return (
    <View style={{ flex: 1, backgroundColor }}>
      {/* Translucent allows content to go under the status bar */}
      <StatusBar translucent backgroundColor="transparent" barStyle={barStyle} />
      {children}
    </View>
  );
};

export default AndroidStatusBarSafeView;
