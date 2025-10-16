// import { View, TouchableOpacity, Text, StyleSheet } from "react-native"
// import Ionicons from "react-native-vector-icons/Ionicons"

// const BottomTabBar = ({ state, descriptors, navigation, fileImported }) => {
//   return (
//     <View style={styles.container}>
//       {state.routes.map((route, index) => {
//         const { options } = descriptors[route.key]
//         const label =
//           options.tabBarLabel !== undefined
//             ? options.tabBarLabel
//             : options.title !== undefined
//               ? options.title
//               : route.name

//         const isFocused = state.index === index

//         const onPress = () => {
//           const event = navigation.emit({
//             type: "tabPress",
//             target: route.key,
//             canPreventDefault: true,
//           })

//           if (!isFocused && !event.defaultPrevented) {
//             if (route.name === "AddMeter" && !fileImported) {
//               alert("Please import the customer data file first.")
//             } else {
//               navigation.navigate(route.name)
//             }
//           }
//         }

//         const onLongPress = () => {
//           navigation.emit({
//             type: "tabLongPress",
//             target: route.key,
//           })
//         }

//         let iconName
//         let iconColor = isFocused ? "#007AFF" : "#8E8E93"

//         if (route.name === "Home") {
//           iconName = "home"
//           iconColor = isFocused ? "#007AFF" : "#8E8E93"
//         } else if (route.name === "AddMeter") {
//           iconName = isFocused ? "add-circle" : "add-circle-outline"
//           iconColor = isFocused ? "#007AFF" : "#8E8E93"
//         } else if (route.name === "Account") {
//           iconName = isFocused ? "person" : "person-outline"
//           iconColor = isFocused ? "#007AFF" : "#8E8E93"
//         }

//         const isDisabled = route.name === "AddMeter" && !fileImported

//         return (
//           <TouchableOpacity
//             key={index}
//             accessibilityRole="button"
//             accessibilityState={isFocused ? { selected: true } : {}}
//             accessibilityLabel={options.tabBarAccessibilityLabel}
//             testID={options.tabBarTestID}
//             onPress={onPress}
//             onLongPress={onLongPress}
//             style={[styles.tabButton, isDisabled && styles.disabledTab]}
//           >
//             <Ionicons name={iconName} size={24} color={isDisabled ? "#8E8E93" : iconColor} />
//             <Text style={[styles.tabText, { color: isDisabled ? "#8E8E93" : iconColor }]}>{label}</Text>
//           </TouchableOpacity>
//         )
//       })}
//     </View>
//   )
// }

// const styles = StyleSheet.create({
//   container: {
//     flexDirection: "row",
//     backgroundColor: "#FFFFFF",
//     paddingBottom: 15,
//     paddingTop: 10,
//     borderTopWidth: 1,
//     borderTopColor: "#E9ECEF",
//     elevation: 8,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: -2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 3,
//     // Remove absolute positioning that was causing issues
//   },
//   tabButton: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   tabText: {
//     fontSize: 12,
//     marginTop: 4,
//   },
//   disabledTab: {
//     opacity: 0.5,
//   },
// })

// export default BottomTabBar
