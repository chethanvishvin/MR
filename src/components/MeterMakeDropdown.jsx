"use client"

import { useState, useEffect } from "react"
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Modal, 
  FlatList, 
  TextInput,
  Keyboard
} from "react-native"
import Icon from "react-native-vector-icons/Ionicons"

const MeterMakeDropdown = ({ label, onSelect, disabled, value, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [searchText, setSearchText] = useState("")
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customValue, setCustomValue] = useState("")

  const meterMakes = [
    { label: "ACCURATE", value: "ACCURATE" },
    { label: "ACTARIS", value: "ACTARIS" },
    { label: "ALSTOM", value: "ALSTOM" },
    { label: "AVON", value: "AVON" },
    { label: "BHEK", value: "BHEK" },
    { label: "BHEL", value: "BHEL" },
    { label: "CAPITAL", value: "CAPITAL" },
    { label: "DATAK", value: "DATAK" },
    { label: "ECE", value: "ECE" },
    { label: "ELYMER", value: "ELYMER" },
    { label: "EMCO", value: "EMCO" },
    { label: "ETV", value: "ETV" },
    { label: "HAVELLS", value: "HAVELLS" },
    { label: "HIL", value: "HIL" },
    { label: "I M", value: "I M" },
    { label: "INDOTECH", value: "INDOTECH" },
    { label: "ISKRA", value: "ISKRA" },
    { label: "L & T", value: "L & T" },
    { label: "L & G", value: "L & G" },
    { label: "LANDIS", value: "LANDIS" },
    { label: "OLAY", value: "OLAY" },
    { label: "OMANI", value: "OMANI" },
    { label: "PRECESITION", value: "PRECESITION" },
    { label: "R.C", value: "R.C" },
    { label: "SECURE", value: "SECURE" },
    { label: "SIEMENS", value: "SIEMENS" },
    { label: "T.T.L", value: "T.T.L" },
    { label: "UE", value: "UE" },
    { label: "MAXWELL JAIPUR", value: "MAXWELL JAIPUR" },
    { label: "Linkwell Hyderabad", value: "Linkwell Hyderabad" },
    { label: "Others", value: "Others" },
  ]

  // Search logic with "Others" fallback
  const filteredData = (() => {
    if (searchText === '') return meterMakes
    
    const search = searchText.toLowerCase()
    const results = []
    
    for (const item of meterMakes) {
      const text = item.label.toLowerCase()
      
      if (item.value === "Others") continue
      
      if (text[0] !== search[0]) continue
      
      let searchIndex = 1
      let textIndex = 1
      
      while (searchIndex < search.length && textIndex < text.length) {
        if (text[textIndex] === search[searchIndex]) {
          searchIndex++
        }
        textIndex++
      }
      
      if (searchIndex === search.length) {
        results.push(item)
      }
    }
    
    if (results.length === 0) {
      const othersItem = meterMakes.find(item => item.value === "Others")
      if (othersItem) results.push(othersItem)
    }
    
    return results
  })()

  useEffect(() => {
    if (value) {
      const foundItem = meterMakes.find((item) => item.value === value)
      if (foundItem) {
        setSelectedItem(foundItem)
        if (foundItem.value === "Others") {
          setShowCustomInput(true)
          setCustomValue(value === "Others" ? "" : value)
        } else {
          setShowCustomInput(false)
          setCustomValue("")
        }
      } else {
        setSelectedItem({ label: "Others", value: "Others" })
        setShowCustomInput(true)
        setCustomValue(value)
      }
    } else {
      setSelectedItem(null)
      setShowCustomInput(false)
      setCustomValue("")
    }
  }, [value])

  const handleSelectItem = (item) => {
    // Dismiss keyboard first
    Keyboard.dismiss()
    
    // Small delay to ensure keyboard dismissal completes
    setTimeout(() => {
      setSelectedItem(item)
      setSearchText("")
      
      if (item.value === "Others") {
        setShowCustomInput(true)
        setCustomValue("")
        setIsOpen(false)
      } else {
        setShowCustomInput(false)
        setCustomValue("")
        onSelect(item.value)
        setIsOpen(false)
      }
    }, 10)
  }

  const handleCustomInputSubmit = () => {
    if (customValue.trim()) {
      onSelect(customValue.trim())
      setShowCustomInput(false)
    }
  }

  const closeModal = () => {
    Keyboard.dismiss()
    setIsOpen(false)
    setSearchText("")
  }

  const getDisplayText = () => {
    if (disabled && value === "N/A") {
      return "N/A"
    }
    
    if (selectedItem) {
      if (selectedItem.value === "Others" && customValue) {
        return customValue
      }
      if (selectedItem.value === "Others" && !customValue) {
        return "Others (Enter meter make name)"
      }
      return selectedItem.label
    }
    
    return placeholder || "Select Meter Make"
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      
      <TouchableOpacity
        style={[styles.dropdown, disabled && styles.disabledDropdown]}
        onPress={() => {
          if (disabled) return
          setIsOpen(true)
        }}
        disabled={disabled}
      >
        <Text style={[styles.selectedItemText, disabled && styles.disabledText]}>
          {getDisplayText()}
        </Text>
        <Icon 
          name={isOpen ? "chevron-up" : "chevron-down"} 
          size={20} 
          color={disabled ? "#999" : "#666"} 
        />
      </TouchableOpacity>

      {/* Custom input for "Others" */}
      {showCustomInput && !disabled && (
        <View style={styles.customInputContainer}>
          <TextInput
            style={styles.customInput}
            placeholder="Enter custom meter make"
            value={customValue}
            onChangeText={setCustomValue}
            autoFocus={true}
          />
          <View style={styles.customInputButtons}>
            <TouchableOpacity
              style={[styles.customButton, styles.cancelButton]}
              onPress={() => {
                setShowCustomInput(false)
                setCustomValue("")
                setSelectedItem(null)
                onSelect("")
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.customButton, styles.submitButton]}
              onPress={handleCustomInputSubmit}
            >
              <Text style={styles.submitButtonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={isOpen} animationType="slide" transparent>
        <TouchableOpacity 
          style={styles.modalBackdrop} 
          activeOpacity={1}
          onPress={closeModal}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity 
              activeOpacity={1}
              style={styles.modalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Meter Make</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeModal}
                >
                  <Icon name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.searchContainer}>
                <Icon name="search" size={20} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search meter makes..."
                  value={searchText}
                  onChangeText={setSearchText}
                  autoCapitalize="none"
                  autoFocus={true}
                />
                {searchText.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearSearchButton}
                    onPress={() => setSearchText("")}
                  >
                    <Icon name="close-circle" size={20} color="#666" />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={filteredData}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[
                      styles.item,
                      selectedItem?.value === item.value && styles.selectedItem
                    ]} 
                    onPress={() => handleSelectItem(item)}
                    hitSlop={{top: 15, bottom: 15, left: 0, right: 0}}
                  >
                    <Text style={[
                      styles.itemText,
                      selectedItem?.value === item.value && styles.selectedItemText
                    ]}>
                      {item.label}
                    </Text>
                    {selectedItem?.value === item.value && (
                      <Icon name="checkmark" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                )}
                style={styles.flatList}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={() => (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No meter makes found</Text>
                  </View>
                )}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  dropdown: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 48,
  },
  disabledDropdown: {
    backgroundColor: "#f0f0f0",
    opacity: 0.6,
  },
  selectedItemText: {
    fontSize: 16,
    flex: 1,
    color: "#333",
  },
  disabledText: {
    color: "#666",
  },
  customInputContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  customInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    fontSize: 16,
    marginBottom: 12,
  },
  customInputButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  customButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 80,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#6c757d",
  },
  submitButton: {
    backgroundColor: "#007AFF",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#f8f9fa",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },
  clearSearchButton: {
    padding: 4,
  },
  flatList: {
    maxHeight: 300,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  selectedItem: {
    backgroundColor: "#e3f2fd",
  },
  itemText: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  selectedItemText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
})

export default MeterMakeDropdown