import React from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const PhotoPreview = ({ photo, onRetake, onAccept }) => {
  if (!photo) return null;

  return (
    <View style={styles.container}>
      <Image 
        source={{ uri: photo.uri || `file://${photo.path}` }} 
        style={styles.preview}
        resizeMode="contain"
      />
      {/* <View style={styles.overlay}>
        <Text style={styles.infoText}>
          Time: {photo.timestamp || new Date().toLocaleString()}
        </Text>
        <Text style={styles.infoText}>
          Location: {photo.location || 'Getting location...'}
        </Text>
      </View> */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={onRetake}>
          <Text style={styles.buttonText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={onAccept}>
          <Text style={styles.buttonText}>Use Photo</Text>
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
  preview: {
    width: width,
    height: width * 4/3,
  },
  overlay: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
  },
  infoText: {
    color: 'white',
    fontSize: 14,
    marginBottom: 5,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#666',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PhotoPreview;

