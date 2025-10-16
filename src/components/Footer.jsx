import { View, Text, StyleSheet } from "react-native"


const Footer = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.copyrightText}>
        <Text style={styles.highlight}>© 2025–2026</Text> Vishvin Technologies Pvt Ltd.{"\n"}All rights reserved.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F1F3F5", // light soft gray background
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#DEE2E6",
    alignItems: "center",
    justifyContent: "center",
  },
  copyrightText: {
    fontSize: 12,
    color: "#495057", // dark slate grey text
    textAlign: "center",
    fontWeight: "400",
    lineHeight: 18,
  },
  highlight: {
    color: "#5C7CFA", // primary blue (accent on years)
    fontWeight: "500",
  },
})

export default Footer
