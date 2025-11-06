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

export const validateImageFromDatabase = async (imageUrl) => {
  if (!imageUrl) {
    return { valid: false, error: "Image URL is empty", compressedUri: null }
  }

  try {
    // Check if it's a URL or a file path
    if (imageUrl.startsWith("http")) {
      // It's a URL - fetch and check size
      const response = await fetch(imageUrl, { method: "HEAD" })

      if (!response.ok) {
        return { valid: false, error: "Failed to fetch image from server", compressedUri: null }
      }

      // Check file size from headers
      const contentLength = response.headers.get("content-length")
      let needsCompression = false

      if (contentLength) {
        const sizeInMB = Number.parseInt(contentLength, 10) / (1024 * 1024)
        if (sizeInMB > 2) {
          needsCompression = true
          console.log(`[v0] Image exceeds 2MB (${sizeInMB.toFixed(2)}MB), will compress`)
        }
      }

      // Check content type
      const contentType = response.headers.get("content-type")
      if (contentType && !contentType.includes("image/jpeg")) {
        return {
          valid: false,
          error: "Image format must be JPG/JPEG",
          compressedUri: null,
        }
      }

      return { valid: true, error: null, compressedUri: imageUrl, needsCompression }
    } else if (imageUrl.startsWith("file://") || !imageUrl.startsWith("http")) {
      // It's a local file path - check using file system
      const fileStats = await RNFS.stat(imageUrl)
      const sizeInMB = fileStats.size / (1024 * 1024)
      let needsCompression = false
      let compressedUri = imageUrl

      if (sizeInMB > 2) {
        needsCompression = true
        console.log(`[v0] Image exceeds 2MB (${sizeInMB.toFixed(2)}MB), compressing now...`)

        try {
          compressedUri = await compressImage(imageUrl, 2000)
          console.log(`[v0] Image compressed successfully`)
        } catch (compressionError) {
          console.error("[v0] Compression failed:", compressionError)
          return {
            valid: false,
            error: `Failed to compress image: ${compressionError.message}`,
            compressedUri: null,
          }
        }
      }

      // Check if it's JPG by file extension or MIME type
      const fileExtension = imageUrl.split(".").pop().toLowerCase()
      if (!["jpg", "jpeg"].includes(fileExtension)) {
        return {
          valid: false,
          error: "Image format must be JPG/JPEG",
          compressedUri: null,
        }
      }

      return { valid: true, error: null, compressedUri, needsCompression }
    }

    return { valid: false, error: "Invalid image URL format", compressedUri: null }
  } catch (error) {
    console.error("Error validating image from database:", error)
    return { valid: false, error: `Validation error: ${error.message}`, compressedUri: null }
  }
}
