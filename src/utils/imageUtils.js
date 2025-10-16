import { Platform } from "react-native"
import { manipulateAsync, SaveFormat } from "expo-image-manipulator"
import RNFS from "react-native-fs"

// Function to compress an image to ensure it's under the size limit
export const compressImage = async (uri, maxSizeKB = 2000) => {
  try {
    console.log(`Starting image compression for: ${uri}`)

    // Check if file exists
    const fileExists = await RNFS.exists(uri)
    if (!fileExists) {
      console.error(`File does not exist: ${uri}`)
      throw new Error("Image file not found")
    }

    // Get file stats to check size
    const fileStats = await RNFS.stat(uri)
    console.log(`Original file size: ${fileStats.size / 1024} KB`)

    // If file is already under the limit, return the original
    if (fileStats.size / 1024 <= maxSizeKB) {
      console.log("Image already under size limit, no compression needed")
      return uri
    }

    // For Android, we need to fix the file:// URI
    let fileUri = uri
    if (Platform.OS === "android" && !uri.startsWith("content://")) {
      fileUri = uri.startsWith("file://") ? uri : `file://${uri}`
    }

    // Calculate compression quality based on current size
    // Start with higher quality for smaller files, lower for larger files
    let quality = 0.8
    const sizeInMB = fileStats.size / (1024 * 1024)

    if (sizeInMB > 5) {
      quality = 0.5 // Very large file, use lower quality
    } else if (sizeInMB > 3) {
      quality = 0.6
    } else if (sizeInMB > 1) {
      quality = 0.7
    }

    console.log(`Using compression quality: ${quality}`)

    // First attempt: compress with calculated quality
    let result = await manipulateAsync(
      fileUri,
      [{ resize: { width: 1200 } }], // Resize to reasonable width, maintain aspect ratio
      { compress: quality, format: SaveFormat.JPEG },
    )

    // Check if we need further compression
    let resultStats = await RNFS.stat(result.uri)
    console.log(`Size after first compression: ${resultStats.size / 1024} KB`)

    // If still too large, compress more aggressively
    if (resultStats.size / 1024 > maxSizeKB) {
      console.log("First compression not sufficient, trying more aggressive compression")

      // Try with lower quality
      result = await manipulateAsync(
        result.uri,
        [{ resize: { width: 1000 } }], // Smaller width
        { compress: 0.5, format: SaveFormat.JPEG },
      )

      resultStats = await RNFS.stat(result.uri)
      console.log(`Size after second compression: ${resultStats.size / 1024} KB`)

      // If still too large, final attempt with very aggressive compression
      if (resultStats.size / 1024 > maxSizeKB) {
        console.log("Second compression not sufficient, using maximum compression")
        result = await manipulateAsync(
          result.uri,
          [{ resize: { width: 800 } }], // Even smaller width
          { compress: 0.3, format: SaveFormat.JPEG },
        )

        resultStats = await RNFS.stat(result.uri)
        console.log(`Size after final compression: ${resultStats.size / 1024} KB`)
      }
    }

    console.log(`Compression complete. Final size: ${resultStats.size / 1024} KB`)
    return result.uri
  } catch (error) {
    console.error("Error in compressImage:", error)
    throw error
  }
}

// Extremely simplified version - no metadata, no processing
export const processImage = async (photo) => {
  try {
    console.log("Processing photo with compression")

    if (!photo || !photo.uri) {
      throw new Error("Invalid photo object")
    }

    // Compress the image to ensure it's under 2MB
    const compressedUri = await compressImage(photo.uri)

    // Return the compressed URI
    return {
      uri: compressedUri,
    }
  } catch (error) {
    console.error("Error in processImage:", error)
    throw error
  }
}
