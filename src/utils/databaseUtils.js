import {
  getDatabase as getMainDatabase,
  initDatabase as initMainDatabase,
  saveOldMeterData as saveOldMeterToMain,
  saveNewMeterData as saveNewMeterToMain,
  getCustomerData,
  insertCustomerData,
  clearCustomerData,
  searchCustomers as searchCustomersMain,
  searchCustomersBySection as searchCustomersBySectionMain,
  getCustomersBySection as getCustomersBySectionMain,
} from "../database/database"
import { openDatabase } from "react-native-sqlite-storage"

// Re-export main database functions
export const initDatabase = initMainDatabase
export const getDatabase = getMainDatabase

// Customer data functions
export const insertCustomer = insertCustomerData
export const getCustomer = getCustomerData
export const clearCustomer = clearCustomerData
export const searchCustomers = searchCustomersMain
export const searchCustomersBySection = searchCustomersBySectionMain
export const getCustomersBySection = getCustomersBySectionMain

// Create database with error handling
const createDatabase = () => {
  try {
    return openDatabase(
      { name: "MeterReadingDB.db", location: "default" },
      () => console.log("Database opened successfully"),
      (error) => console.error("Error opening database", error),
    )
  } catch (error) {
    console.error("Fatal error creating database:", error)
    // Return a dummy database object that won't crash when methods are called
    return {
      transaction: (callback, errorCallback, successCallback) => {
        console.error("Attempted to use database after creation failure")
        if (errorCallback) errorCallback(new Error("Database creation failed"))
      },
    }
  }
}

const db = createDatabase()

// Enhanced saveOldMeterData function with duplicate checking
export const saveOldMeterData = async (data) => {
  console.log("Attempting to save old meter data:", JSON.stringify(data, null, 2))

  // The database allows multiple entries per account, sync process handles duplicates
  // Only skip save if data is completely empty
  if (!data || !data.account_id) {
    console.log("Invalid data or missing account_id - skipping save")
    return null
  }

  return saveOldMeterToMain(data)
}

// Enhanced saveNewMeterData function with duplicate checking
export const saveNewMeterData = async (data) => {
  console.log("Attempting to save new meter data:", JSON.stringify(data, null, 2))

  // The database allows multiple entries per account, sync process handles duplicates
  // Only skip save if data is completely empty
  if (!data || !data.account_id) {
    console.log("Invalid data or missing account_id - skipping save")
    return null
  }

  return saveNewMeterToMain(data)
}

// Get all linked meter records (pairs of old and new meters)
export const getLinkedMeterRecords = () => {
  console.log("Getting all linked meter records...")
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          tx.executeSql(
            `SELECT 
               o.id as old_id,
               o.account_id,
               o.serial_no_old,
               o.mfd_year_old,
               o.final_reading,
               o.image_1_old,
               o.image_2_old,
               n.id as new_id,
               n.image_1_new,
               n.image_2_new,
               n.meter_make_new,
               n.serial_no_new,
               n.mfd_year_new,
               n.lat,
               n.lon
             FROM old_meter_data o
             LEFT JOIN new_meter_data n ON o.id = n.old_meter_id
             WHERE o.is_uploaded = 0`,
            [],
            (_, { rows }) => {
              try {
                const data = []
                for (let i = 0; i < rows.length; i++) {
                  data.push(rows.item(i))
                }
                console.log(`Found ${data.length} linked meter pairs`)
                resolve(data)
              } catch (error) {
                console.error("Error processing linked meter records:", error)
                resolve([])
              }
            },
            (_, error) => {
              console.error("Error getting linked meter records:", error)
              resolve([])
            },
          )
        },
        (transactionError) => {
          console.error("Transaction error getting linked meter records:", transactionError)
          resolve([])
        },
      )
    } catch (error) {
      console.error("Exception getting linked meter records:", error)
      resolve([])
    }
  })
}

// Get all pending old meter data
export const getPendingOldMeterData = (onlyUnlinked = false) => {
  console.log(`Getting all pending old meter data (onlyUnlinked: ${onlyUnlinked})...`)
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          const query = "SELECT * FROM old_meter_data WHERE is_uploaded = 0 ORDER BY created_at ASC"

          tx.executeSql(
            query,
            [],
            (_, { rows }) => {
              try {
                const data = []
                for (let i = 0; i < rows.length; i++) {
                  data.push(rows.item(i))
                }
                console.log(`Found ${data.length} pending old meter records`)
                resolve(data)
              } catch (error) {
                console.error("Error processing query results:", error)
                resolve([])
              }
            },
            (_, error) => {
              console.error("Error getting pending old meter data:", error)
              resolve([])
            },
          )
        },
        (transactionError) => {
          console.error("Transaction error getting pending old meter data:", transactionError)
          resolve([])
        },
      )
    } catch (error) {
      console.error("Exception getting pending old meter data:", error)
      resolve([])
    }
  })
}

// Get all pending new meter data
export const getPendingNewMeterData = (onlyUnlinked = false) => {
  console.log(`Getting all pending new meter data (onlyUnlinked: ${onlyUnlinked})...`)
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          const query = "SELECT * FROM new_meter_data WHERE is_uploaded = 0 ORDER BY created_at ASC"

          tx.executeSql(
            query,
            [],
            (_, { rows }) => {
              try {
                const data = []
                for (let i = 0; i < rows.length; i++) {
                  const record = rows.item(i)
                  // Ensure initial_reading is set for backward compatibility
                  if (!record.initial_reading && record.initial_reading_kwh) {
                    record.initial_reading = record.initial_reading_kwh
                  }
                  data.push(record)
                }
                console.log(`Found ${data.length} pending new meter records`)
                resolve(data)
              } catch (error) {
                console.error("Error processing query results:", error)
                resolve([])
              }
            },
            (_, error) => {
              console.error("Error getting pending new meter data:", error)
              resolve([])
            },
          )
        },
        (transactionError) => {
          console.error("Transaction error getting pending new meter data:", transactionError)
          resolve([])
        },
      )
    } catch (error) {
      console.error("Exception getting pending new meter data:", error)
      resolve([])
    }
  })
}

// Mark old meter data as uploaded and delete it from database
export const markOldMeterDataAsUploaded = (id) => {
  console.log("Marking old meter data as uploaded and deleting, ID:", id)
  return new Promise(async (resolve, reject) => {
    try {
      if (!id) {
        console.error("Invalid ID for marking old meter data as uploaded")
        resolve({ rowsAffected: 0 })
        return
      }

      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          // Delete the record instead of just marking as uploaded
          tx.executeSql(
            "DELETE FROM old_meter_data WHERE id = ?",
            [id],
            (_, result) => {
              console.log("Old meter data deleted after successful upload:", id, "Rows affected:", result.rowsAffected)
              resolve(result)
            },
            (_, error) => {
              console.error("Error deleting old meter data after upload:", error)
              resolve({ rowsAffected: 0 })
            },
          )
        },
        (transactionError) => {
          console.error("Transaction error deleting old meter data after upload:", transactionError)
          resolve({ rowsAffected: 0 })
        },
      )
    } catch (error) {
      console.error("Exception deleting old meter data after upload:", error)
      resolve({ rowsAffected: 0 })
    }
  })
}

// Mark new meter data as uploaded and delete it from database
export const markNewMeterDataAsUploaded = (id) => {
  console.log("Marking new meter data as uploaded and deleting, ID:", id)
  return new Promise(async (resolve, reject) => {
    try {
      if (!id) {
        console.error("Invalid ID for marking new meter data as uploaded")
        resolve({ rowsAffected: 0 })
        return
      }

      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          // Delete the record instead of just marking as uploaded
          tx.executeSql(
            "DELETE FROM new_meter_data WHERE id = ?",
            [id],
            (_, result) => {
              console.log("New meter data deleted after successful upload:", id, "Rows affected:", result.rowsAffected)
              resolve(result)
            },
            (_, error) => {
              console.error("Error deleting new meter data after upload:", error)
              resolve({ rowsAffected: 0 })
            },
          )
        },
        (transactionError) => {
          console.error("Transaction error deleting new meter data after upload:", transactionError)
          resolve({ rowsAffected: 0 })
        },
      )
    } catch (error) {
      console.error("Exception deleting new meter data after upload:", error)
      resolve({ rowsAffected: 0 })
    }
  })
}

// Get database statistics
export const getDatabaseStats = () => {
  console.log("Getting database statistics...")
  return new Promise(async (resolve, reject) => {
    const stats = {
      oldMeterTotal: 0,
      oldMeterPending: 0,
      newMeterTotal: 0,
      newMeterPending: 0,
      invalidRecords: 0,
    }

    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          // Get old meter stats
          tx.executeSql(
            "SELECT COUNT(*) as total FROM old_meter_data",
            [],
            (_, { rows }) => {
              try {
                stats.oldMeterTotal = rows.item(0).total
                console.log("Old meter total records:", stats.oldMeterTotal)

                tx.executeSql(
                  "SELECT COUNT(*) as pending FROM old_meter_data WHERE is_uploaded = 0",
                  [],
                  (_, { rows }) => {
                    try {
                      stats.oldMeterPending = rows.item(0).pending
                      console.log("Old meter pending records:", stats.oldMeterPending)

                      // Get new meter stats
                      tx.executeSql(
                        "SELECT COUNT(*) as total FROM new_meter_data",
                        [],
                        (_, { rows }) => {
                          try {
                            stats.newMeterTotal = rows.item(0).total
                            console.log("New meter total records:", stats.newMeterTotal)

                            tx.executeSql(
                              "SELECT COUNT(*) as pending FROM new_meter_data WHERE is_uploaded = 0",
                              [],
                              (_, { rows }) => {
                                try {
                                  stats.newMeterPending = rows.item(0).pending
                                  console.log("New meter pending records:", stats.newMeterPending)

                                  // Get invalid records count
                                  tx.executeSql(
                                    "SELECT COUNT(*) as invalid FROM old_meter_data WHERE upload_error IS NOT NULL",
                                    [],
                                    (_, { rows }) => {
                                      try {
                                        const oldInvalid = rows.item(0).invalid || 0

                                        tx.executeSql(
                                          "SELECT COUNT(*) as invalid FROM new_meter_data WHERE upload_error IS NOT NULL",
                                          [],
                                          (_, { rows }) => {
                                            try {
                                              const newInvalid = rows.item(0).invalid || 0
                                              stats.invalidRecords = oldInvalid + newInvalid
                                              console.log("Database statistics:", stats)
                                              resolve(stats)
                                            } catch (error) {
                                              console.error("Error processing new meter invalid count:", error)
                                              stats.invalidRecords = oldInvalid
                                              resolve(stats)
                                            }
                                          },
                                          (_, error) => {
                                            console.error("Error getting new meter invalid count:", error)
                                            stats.invalidRecords = oldInvalid
                                            resolve(stats)
                                          },
                                        )
                                      } catch (error) {
                                        console.error("Error processing old meter invalid count:", error)
                                        stats.invalidRecords = 0
                                        resolve(stats)
                                      }
                                    },
                                    (_, error) => {
                                      console.error("Error getting old meter invalid count:", error)
                                      stats.invalidRecords = 0
                                      resolve(stats)
                                    },
                                  )
                                } catch (error) {
                                  console.error("Error processing new meter pending count:", error)
                                  resolve(stats)
                                }
                              },
                              (_, error) => {
                                console.error("Error getting new meter pending count:", error)
                                resolve(stats)
                              },
                            )
                          } catch (error) {
                            console.error("Error processing new meter total count:", error)
                            resolve(stats)
                          }
                        },
                        (_, error) => {
                          console.error("Error getting new meter total count:", error)
                          resolve(stats)
                        },
                      )
                    } catch (error) {
                      console.error("Error processing old meter pending count:", error)
                      resolve(stats)
                    }
                  },
                  (_, error) => {
                    console.error("Error getting old meter pending count:", error)
                    resolve(stats)
                  },
                )
              } catch (error) {
                console.error("Error processing old meter total count:", error)
                resolve(stats)
              }
            },
            (_, error) => {
              console.error("Error getting old meter total count:", error)
              resolve(stats)
            },
          )
        },
        (transactionError) => {
          console.error("Transaction error getting database stats:", transactionError)
          resolve(stats)
        },
      )
    } catch (error) {
      console.error("Exception getting database stats:", error)
      resolve(stats)
    }
  })
}

// Function to reset the database (for testing/debugging)
export const resetDatabase = () => {
  console.log("Resetting database...")
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          tx.executeSql("DROP TABLE IF EXISTS old_meter_data", [], () => {
            tx.executeSql("DROP TABLE IF EXISTS new_meter_data", [], () => {
              tx.executeSql("DROP TABLE IF EXISTS unused_meter_serial_numbers", [], () => {
                tx.executeSql("DROP TABLE IF EXISTS sync_metadata", [], () => {
                  tx.executeSql("DROP TABLE IF EXISTS customer_data", [], () => {
                    console.log("Database tables dropped successfully")
                    initDatabase()
                      .then(() => {
                        console.log("Database reset successfully")
                        resolve(true)
                      })
                      .catch((error) => {
                        console.error("Error reinitializing database:", error)
                        reject(error)
                      })
                  })
                })
              })
            })
          })
        },
        (error) => {
          console.error("Transaction error resetting database:", error)
          reject(error)
        },
      )
    } catch (error) {
      console.error("Exception resetting database:", error)
      reject(error)
    }
  })
}

// Get the last sync timestamp for a specific sync type
export const getLastSyncTimestamp = async (syncType) => {
  try {
    const database = await getMainDatabase()

    return new Promise((resolve, reject) => {
      database.transaction((tx) => {
        tx.executeSql(
          "SELECT value FROM sync_metadata WHERE key = ?",
          [`last_${syncType}_sync`],
          (_, { rows }) => {
            if (rows.length > 0) {
              resolve(Number.parseInt(rows.item(0).value, 10))
            } else {
              resolve(0) // No previous sync
            }
          },
          (_, error) => {
            console.error(`Error getting last ${syncType} sync timestamp`, error)
            resolve(0) // Return 0 instead of rejecting
          },
        )
      })
    })
  } catch (error) {
    console.error(`Error in getLastSyncTimestamp for ${syncType}:`, error)
    return 0 // Return 0 instead of throwing
  }
}

// Update the last sync timestamp for a specific sync type
export const updateLastSyncTimestamp = async (syncType) => {
  try {
    const database = await getMainDatabase()
    const now = Date.now()

    return new Promise((resolve, reject) => {
      database.transaction((tx) => {
        tx.executeSql(
          `INSERT OR REPLACE INTO sync_metadata (key, value, last_updated)
           VALUES (?, ?, ?)`,
          [`last_${syncType}_sync`, now.toString(), now],
          (_, result) => {
            console.log(`Updated last ${syncType} sync timestamp`)
            resolve(result)
          },
          (_, error) => {
            console.error(`Error updating last ${syncType} sync timestamp:`, error)
            resolve({ rowsAffected: 0 }) // Resolve instead of reject
          },
        )
      })
    })
  } catch (error) {
    console.error(`Error in updateLastSyncTimestamp for ${syncType}:`, error)
    return { rowsAffected: 0 } // Return default instead of throwing
  }
}

// Save unused meter serial numbers to SQLite
export const saveUnusedMeterSerialNumbers = async (userInformation, clearFirst = false) => {
  try {
    const database = await getMainDatabase()
    let processedCount = 0

    console.log(`Starting to save unused meter serial numbers. Clear first: ${clearFirst}`)
    console.log(`Input data length: ${userInformation ? userInformation.length : 0}`)

    return new Promise((resolve, reject) => {
      database.transaction(
        (tx) => {
          // Clear existing unused meter serial numbers if requested
          if (clearFirst) {
            tx.executeSql(
              "DELETE FROM unused_meter_serial_numbers",
              [],
              (_, result) => {
                console.log(`Cleared ${result.rowsAffected} existing unused meter serial numbers`)
              },
              (_, error) => {
                console.error("Error clearing unused meter serial numbers:", error)
              },
            )
          }

          // Collect all serial numbers first
          const allSerialNumbers = []

          if (!userInformation || !Array.isArray(userInformation)) {
            console.error("Invalid userInformation provided:", userInformation)
            resolve({ processedCount: 0 })
            return
          }

          userInformation.forEach((contractor, index) => {
            console.log(`Processing contractor ${index + 1}/${userInformation.length}:`, {
              id: contractor.id,
              unused_meter_serial_no: contractor.unused_meter_serial_no,
            })

            if (contractor.unused_meter_serial_no && contractor.unused_meter_serial_no.trim() !== "") {
              // Split comma-separated serial numbers
              const serialNumbers = contractor.unused_meter_serial_no
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s !== "")

              console.log(
                `Contractor ${contractor.id}: Found ${serialNumbers.length} unused serial numbers:`,
                serialNumbers,
              )

              serialNumbers.forEach((serialNumber) => {
                if (serialNumber && serialNumber.trim() !== "") {
                  allSerialNumbers.push(serialNumber.trim())
                }
              })
            } else {
              console.log(`Contractor ${contractor.id}: No unused meter serial numbers`)
            }
          })

          console.log(`Total serial numbers to process: ${allSerialNumbers.length}`)

          // Insert all serial numbers
          let insertedCount = 0
          let completedInserts = 0

          if (allSerialNumbers.length === 0) {
            console.log("No serial numbers to insert")
            resolve({ processedCount: 0 })
            return
          }

          allSerialNumbers.forEach((serialNumber, index) => {
            tx.executeSql(
              `INSERT OR REPLACE INTO unused_meter_serial_numbers 
               (serial_number, is_valid, is_used, last_updated)
               VALUES (?, 1, 0, ?)`,
              [serialNumber, Date.now()],
              (_, result) => {
                insertedCount++
                completedInserts++

                if (insertedCount <= 10 || insertedCount % 100 === 0) {
                  console.log(`Inserted serial number ${insertedCount}/${allSerialNumbers.length}: ${serialNumber}`)
                }

                // Check if all inserts are complete
                if (completedInserts === allSerialNumbers.length) {
                  console.log(`Successfully processed ${insertedCount} unused meter serial numbers`)
                  processedCount = insertedCount
                }
              },
              (_, error) => {
                completedInserts++
                console.error(`Error inserting serial number ${serialNumber}:`, error)

                // Check if all inserts are complete (including failed ones)
                if (completedInserts === allSerialNumbers.length) {
                  console.log(
                    `Completed processing with ${insertedCount} successful inserts out of ${allSerialNumbers.length}`,
                  )
                  processedCount = insertedCount
                }
              },
            )
          })
        },
        (error) => {
          console.error("Transaction error in saveUnusedMeterSerialNumbers:", error)
          resolve({ processedCount: 0 })
        },
        () => {
          // Transaction success callback
          console.log(`Transaction completed successfully. Processed ${processedCount} serial numbers`)
          resolve({ processedCount })
        },
      )
    })
  } catch (error) {
    console.error("Error in saveUnusedMeterSerialNumbers:", error)
    return { processedCount: 0 }
  }
}

// Remove used meter serial numbers from the database
export const removeUsedMeterSerialNumbers = async (userInformation) => {
  try {
    const database = await getMainDatabase()
    let removedCount = 0

    return new Promise((resolve, reject) => {
      database.transaction((tx) => {
        // Process each user information entry
        userInformation.forEach((info) => {
          if (info.used_meter_serial_no && info.used_meter_serial_no.trim() !== "") {
            // Split comma-separated serial numbers
            const serialNumbers = info.used_meter_serial_no
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s !== "")

            serialNumbers.forEach((serialNumber) => {
              tx.executeSql(
                "DELETE FROM unused_meter_serial_numbers WHERE serial_number = ?",
                [serialNumber],
                (_, result) => {
                  if (result.rowsAffected > 0) {
                    removedCount++
                    console.log(`Removed used meter serial number: ${serialNumber}`)
                  }
                },
                (_, error) => {
                  console.error(`Error removing serial number ${serialNumber}:`, error)
                },
              )
            })
          }
        })

        console.log(`Removed ${removedCount} used meter serial numbers`)
        resolve({ removedCount })
      })
    })
  } catch (error) {
    console.error("Error in removeUsedMeterSerialNumbers:", error)
    return { removedCount: 0 } // Return default instead of throwing
  }
}

// Check if a meter serial number is valid (unused)
export const isValidMeterSerialNumber = async (serialNumber) => {
  try {
    const database = await getMainDatabase()

    return new Promise((resolve, reject) => {
      database.transaction((tx) => {
        tx.executeSql(
          "SELECT * FROM unused_meter_serial_numbers WHERE serial_number = ? AND is_valid = 1 AND is_used = 0",
          [serialNumber],
          (_, { rows }) => {
            resolve(rows.length > 0)
          },
          (_, error) => {
            console.error("Error validating meter serial number", error)
            resolve(false) // Return false instead of rejecting
          },
        )
      })
    })
  } catch (error) {
    console.error("Error in isValidMeterSerialNumber:", error)
    return false // Return false instead of throwing
  }
}

// Get all unused meter serial numbers
export const getAllUnusedMeterSerialNumbers = async () => {
  try {
    const database = await getMainDatabase()

    return new Promise((resolve, reject) => {
      database.transaction((tx) => {
        tx.executeSql(
          "SELECT serial_number FROM unused_meter_serial_numbers WHERE is_valid = 1 AND is_used = 0",
          [],
          (_, { rows }) => {
            const serialNumbers = []
            for (let i = 0; i < rows.length; i++) {
              serialNumbers.push(rows.item(i).serial_number)
            }
            resolve(serialNumbers)
          },
          (_, error) => {
            console.error("Error getting unused meter serial numbers", error)
            resolve([]) // Return empty array instead of rejecting
          },
        )
      })
    })
  } catch (error) {
    console.error("Error in getAllUnusedMeterSerialNumbers:", error)
    return [] // Return empty array instead of throwing
  }
}

// Clear all unused meter serial numbers
export const clearUnusedMeterSerialNumbers = async () => {
  try {
    const database = await getMainDatabase()

    return new Promise((resolve, reject) => {
      database.transaction((tx) => {
        tx.executeSql(
          "DELETE FROM unused_meter_serial_numbers",
          [],
          (_, result) => {
            console.log("Cleared all unused meter serial numbers")
            resolve(result)
          },
          (_, error) => {
            console.error("Error clearing unused meter serial numbers:", error)
            resolve({ rowsAffected: 0 }) // Resolve instead of reject
          },
        )
      })
    })
  } catch (error) {
    console.error("Error in clearUnusedMeterSerialNumbers:", error)
    return { rowsAffected: 0 } // Return default instead of throwing
  }
}

// Get all failed uploads (records with errors)
export const getFailedUploads = () => {
  console.log("Getting all failed uploads...")
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          // Get failed old meter uploads
          tx.executeSql(
            `SELECT *, 1 as is_old_meter FROM old_meter_data 
             WHERE upload_error IS NOT NULL AND is_uploaded = 0`,
            [],
            (_, { rows: oldRows }) => {
              // Get failed new meter uploads
              tx.executeSql(
                `SELECT *, 0 as is_old_meter FROM new_meter_data 
                 WHERE upload_error IS NOT NULL AND is_uploaded = 0`,
                [],
                (_, { rows: newRows }) => {
                  // Combine the results
                  const oldMeterData = []
                  for (let i = 0; i < oldRows.length; i++) {
                    oldMeterData.push(oldRows.item(i))
                  }

                  const newMeterData = []
                  for (let i = 0; i < newRows.length; i++) {
                    newMeterData.push(newRows.item(i))
                  }

                  const combinedData = [...oldMeterData, ...newMeterData]

                  console.log(
                    `Found ${combinedData.length} failed uploads (${oldMeterData.length} old, ${newMeterData.length} new)`,
                  )
                  resolve(combinedData)
                },
                (_, error) => {
                  console.error("Error getting failed new meter uploads:", error)
                  const oldMeterData = []
                  for (let i = 0; i < oldRows.length; i++) {
                    oldMeterData.push(oldRows.item(i))
                  }
                  resolve(oldMeterData)
                },
              )
            },
            (_, error) => {
              console.error("Error getting failed old meter uploads:", error)
              resolve([])
            },
          )
        },
        (error) => {
          console.error("Transaction error getting failed uploads:", error)
          resolve([])
        },
      )
    } catch (error) {
      console.error("Exception getting failed uploads:", error)
      resolve([])
    }
  })
}

// Delete a failed upload
export const deleteFailedUpload = (id, isOldMeter) => {
  console.log(`Deleting failed ${isOldMeter ? "old" : "new"} meter upload with ID: ${id}`)
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          const tableName = isOldMeter ? "old_meter_data" : "new_meter_data"
          tx.executeSql(
            `DELETE FROM ${tableName} WHERE id = ?`,
            [id],
            (_, result) => {
              console.log(`Deleted failed upload with ID: ${id}, Rows affected: ${result.rowsAffected}`)
              resolve(result.rowsAffected > 0)
            },
            (_, error) => {
              console.error(`Error deleting failed upload with ID: ${id}:`, error)
              resolve(false)
            },
          )
        },
        (transactionError) => {
          console.error(`Transaction error deleting failed upload with ID: ${id}:`, transactionError)
          resolve(false)
        },
      )
    } catch (error) {
      console.error(`Exception deleting failed upload with ID: ${id}:`, error)
      resolve(false)
    }
  })
}

// Update a failed upload with new data
export const updateFailedUpload = (id, isOldMeter, data) => {
  console.log(`Updating failed ${isOldMeter ? "old" : "new"} meter upload with ID: ${id}`)
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          if (isOldMeter) {
            // Update old meter data
            tx.executeSql(
              `UPDATE old_meter_data SET 
               serial_no_old = ?, 
               mfd_year_old = ?, 
               final_reading = ?, 
               image_1_old = ?, 
               image_2_old = ?,
               upload_error = NULL
               WHERE id = ?`,
              [data.serial_no_old, data.mfd_year_old, data.final_reading, data.image_1_old, data.image_2_old, id],
              (_, result) => {
                console.log(`Updated old meter data with ID: ${id}, Rows affected: ${result.rowsAffected}`)
                resolve(result.rowsAffected > 0)
              },
              (_, error) => {
                console.error(`Error updating old meter data with ID: ${id}:`, error)
                resolve(false)
              },
            )
          } else {
            // Update new meter data
            tx.executeSql(
              `UPDATE new_meter_data SET 
               serial_no_new = ?, 
               mfd_year_new = ?, 
               meter_make_new = ?, 
               image_1_new = ?, 
               image_2_new = ?,
               lat = ?,
               lon = ?,
               upload_error = NULL
               WHERE id = ?`,
              [
                data.serial_no_new,
                data.mfd_year_new,
                data.meter_make_new,
                data.image_1_new,
                data.image_2_new,
                data.lat,
                data.lon,
                id,
              ],
              (_, result) => {
                console.log(`Updated new meter data with ID: ${id}, Rows affected: ${result.rowsAffected}`)
                resolve(result.rowsAffected > 0)
              },
              (_, error) => {
                console.error(`Error updating new meter data with ID: ${id}:`, error)
                resolve(false)
              },
            )
          }
        },
        (transactionError) => {
          console.error(`Transaction error updating failed upload with ID: ${id}:`, transactionError)
          resolve(false)
        },
      )
    } catch (error) {
      console.error(`Exception updating failed upload with ID: ${id}:`, error)
      resolve(false)
    }
  })
}

// Link old and new meter records together
export const linkMeterRecords = async (oldMeterId, newMeterId) => {
  console.log(`Linking old meter ID ${oldMeterId} with new meter ID ${newMeterId}`)
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          // Update new meter record to link with old meter
          tx.executeSql(
            "UPDATE new_meter_data SET old_meter_id = ? WHERE id = ?",
            [oldMeterId, newMeterId],
            (_, result) => {
              console.log(`Linked old meter ID ${oldMeterId} with new meter ID ${newMeterId}`)
              resolve({
                oldMeterUpdated: true,
                newMeterUpdated: result.rowsAffected > 0,
              })
            },
            (_, error) => {
              console.error("Error linking meter records:", error)
              resolve({
                oldMeterUpdated: false,
                newMeterUpdated: false,
              })
            },
          )
        },
        (transactionError) => {
          console.error("Transaction error linking meter records:", transactionError)
          resolve({
            oldMeterUpdated: false,
            newMeterUpdated: false,
          })
        },
      )
    } catch (error) {
      console.error("Exception linking meter records:", error)
      resolve({
        oldMeterUpdated: false,
        newMeterUpdated: false,
      })
    }
  })
}

// Mark a meter pair as invalid (e.g., due to validation error)
export const markMeterPairAsInvalid = (oldMeterId, newMeterId, errorMessage) => {
  console.log(`Marking meter pair as invalid: Old ID ${oldMeterId}, New ID ${newMeterId}, Error: ${errorMessage}`)
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getMainDatabase()

      database.transaction(
        (tx) => {
          const promises = []

          // Update old meter record if provided
          if (oldMeterId) {
            promises.push(
              new Promise((innerResolve, innerReject) => {
                tx.executeSql(
                  "UPDATE old_meter_data SET upload_error = ? WHERE id = ?",
                  [errorMessage, oldMeterId],
                  (_, result) => {
                    innerResolve(result.rowsAffected > 0)
                  },
                  (_, error) => {
                    console.error("Error marking old meter as invalid:", error)
                    innerResolve(false)
                  },
                )
              }),
            )
          }

          // Update new meter record if provided
          if (newMeterId) {
            promises.push(
              new Promise((innerResolve, innerReject) => {
                tx.executeSql(
                  "UPDATE new_meter_data SET upload_error = ? WHERE id = ?",
                  [errorMessage, newMeterId],
                  (_, result) => {
                    innerResolve(result.rowsAffected > 0)
                  },
                  (_, error) => {
                    console.error("Error marking new meter as invalid:", error)
                    innerResolve(false)
                  },
                )
              }),
            )
          }

          Promise.all(promises)
            .then((results) => {
              console.log(`Marked meter pair as invalid: Old ID ${oldMeterId}, New ID ${newMeterId}`)
              resolve({
                oldMeterUpdated: results[0] || false,
                newMeterUpdated: results[1] || false,
              })
            })
            .catch((error) => {
              console.error("Error marking meter pair as invalid:", error)
              resolve({
                oldMeterUpdated: false,
                newMeterUpdated: false,
              })
            })
        },
        (transactionError) => {
          console.error("Transaction error marking meter pair as invalid:", transactionError)
          resolve({
            oldMeterUpdated: false,
            newMeterUpdated: false,
          })
        },
      )
    } catch (error) {
      console.error("Exception marking meter pair as invalid:", error)
      resolve({
        oldMeterUpdated: false,
        newMeterUpdated: false,
      })
    }
  })
}

// Add a function to mark meter data with error status
export const markMeterDataWithError = async (
  id,
  isOldMeter,
  errorMessage,
  isUploaded = false,
  duplicateMessage = null,
  isDuplicateError = false,
  isStorageError = false,
) => {
  console.log(`Marking ${isOldMeter ? "old" : "new"} meter data with error, ID: ${id}`)
  return new Promise(async (resolve, reject) => {
    try {
      if (!id) {
        console.error(`Invalid ID for marking ${isOldMeter ? "old" : "new"} meter data with error`)
        resolve({ rowsAffected: 0 })
        return
      }

      const database = await getMainDatabase()
      const tableName = isOldMeter ? "old_meter_data" : "new_meter_data"

      database.transaction((tx) => {
        tx.executeSql(
          `UPDATE ${tableName} SET upload_error = ?, is_uploaded = ? WHERE id = ?`,
          [duplicateMessage || errorMessage, isUploaded ? 1 : 0, id],
          (_, result) => {
            console.log(
              `${isOldMeter ? "Old" : "New"} meter data marked with error:`,
              id,
              "Rows affected:",
              result.rowsAffected,
            )
            resolve(result)
          },
          (_, error) => {
            console.error(`Error marking ${isOldMeter ? "old" : "new"} meter data with error:`, error)
            resolve({ rowsAffected: 0 })
          },
        )
      })
    } catch (error) {
      console.error(`Exception marking ${isOldMeter ? "old" : "new"} meter data with error:`, error)
      resolve({ rowsAffected: 0 })
    }
  })
}

export default {
  initDatabase,
  saveOldMeterData,
  saveNewMeterData,
  getPendingOldMeterData,
  getPendingNewMeterData,
  markOldMeterDataAsUploaded,
  markNewMeterDataAsUploaded,
  getDatabaseStats,
  resetDatabase,
  getLastSyncTimestamp,
  updateLastSyncTimestamp,
  saveUnusedMeterSerialNumbers,
  removeUsedMeterSerialNumbers,
  isValidMeterSerialNumber,
  getAllUnusedMeterSerialNumbers,
  clearUnusedMeterSerialNumbers,
  linkMeterRecords,
  getLinkedMeterRecords,
  markMeterPairAsInvalid,
  markMeterDataWithError,
  getFailedUploads,
  deleteFailedUpload,
  updateFailedUpload,
}
