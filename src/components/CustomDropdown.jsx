"use client"

import { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from "react-native"

const CustomDropdown = ({ label, data, onSelect, disabled, onPress }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)

  const handleSelectItem = (item) => {
    setSelectedItem(item)
    onSelect(item)
    setIsOpen(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.dropdown, disabled && styles.disabledDropdown]}
        onPress={() => {
          if (disabled) {
            if (onPress) {
              onPress()
            }
            return
          }
          if (onPress && !onPress()) {
            return // Don't open if onPress returns false
          }
          setIsOpen(!isOpen)
        }}
        disabled={disabled}
      >
        <Text style={styles.selectedItemText}>{selectedItem ? selectedItem.label : "Select Section Code"}</Text>
      </TouchableOpacity>

      <Modal visible={isOpen} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Section Code</Text>
            <FlatList
              data={data}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.item} onPress={() => handleSelectItem(item)}>
                  <Text style={styles.itemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              style={styles.flatList}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setIsOpen(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  disabledDropdown: {
    backgroundColor: "#f0f0f0",
    opacity: 0.6,
  },
  selectedItemText: {
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    width: "90%",
    maxHeight: "70%", // Limit the height to 70% of screen
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
    color: "#333",
  },
  flatList: {
    maxHeight: 300, // Fixed height for the list with scrolling
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemText: {
    fontSize: 16,
    color: "#333",
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
})

export default CustomDropdown
