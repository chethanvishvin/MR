import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

const CameraView = ({ onCapture, onClose }) => {
  const [photo, setPhoto] = useState(null);

  const handleCapture = async () => {
    const options = {
      mediaType: 'photo',
      quality: 1,
      saveToPhotos: true, // Save the captured image to the device's gallery
    };

    launchCamera(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.error) {
        console.error('ImagePicker Error: ', response.error);
      } else if (response.assets && response.assets.length > 0) {
        const capturedPhoto = response.assets[0];
        setPhoto(capturedPhoto);
        onCapture(capturedPhoto); // Pass the captured photo to the parent component
      }
    });
  };

  return (
    <View style={styles.container}>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>No photo captured</Text>
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.overlayText}>
          {new Date().toLocaleString()}
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={onClose}
        >
          <Icon name="close" size={24} color="white" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.captureButton}
          onPress={handleCapture}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'white',
    fontSize: 16,
  },
  overlay: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
  },
  overlayText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  closeButton: {
    position: 'absolute',
    left: 20,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'white',
  },
});

export default CameraView;