import SQLite from "react-native-sqlite-storage"

// Enable debugging
SQLite.DEBUG(true)
SQLite.enablePromise(true)

let db = null

// Initialize database connection
const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    SQLite.openDatabase(
      {
        name: "MeterReadingDB",
        location: "default",
      },
      (database) => {
        console.log("Database opened successfully")
        db = database
        resolve(database)
      },
      (error) => {
        console.error("Error opening database", error)
        reject(error)
      },
    )
  })
}

// Get database instance
export const getDatabase = async () => {
  if (!db) {
    await initializeDatabase()
  }
  return db
}

// Update the initDatabase function to include previous_final_reading and billed_date columns
export const initDatabase = () => {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure database is initialized first
      const database = await initializeDatabase()

      database.transaction(
        (tx) => {
          // Create customer data table
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS customer_data (
              id INTEGER PRIMARY KEY,
              account_id TEXT,
              rr_no TEXT,
              consumer_name TEXT,
              consumer_address TEXT,
              division TEXT,
              section TEXT,
              sub_division TEXT,
              phase_type TEXT,
              previous_final_reading TEXT,
              billed_date TEXT,
              last_updated INTEGER
            )`,
            [],
            () => {
              console.log("Customer data table created successfully")

              // Create unused meter serial numbers table
              tx.executeSql(
                `CREATE TABLE IF NOT EXISTS unused_meter_serial_numbers (
                  serial_number TEXT PRIMARY KEY,
                  is_valid INTEGER DEFAULT 1,
                  is_used INTEGER DEFAULT 0,
                  last_updated INTEGER
                )`,
                [],
                () => {
                  console.log("Unused meter serial numbers table created successfully")

                  // Create sync metadata table
                  tx.executeSql(
                    `CREATE TABLE IF NOT EXISTS sync_metadata (
                      key TEXT PRIMARY KEY,
                      value TEXT,
                      last_updated INTEGER
                    )`,
                    [],
                    () => {
                      console.log("Sync metadata table created successfully")

                      // Create old meter data table for offline storage
                      tx.executeSql(
                        `CREATE TABLE IF NOT EXISTS old_meter_data (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          account_id TEXT,
                          serial_no_old TEXT,
                          mfd_year_old TEXT,
                          final_reading TEXT,
                          meter_make_old TEXT,
                          category TEXT, -- Added category field
                          image_1_old TEXT,
                          image_2_old TEXT,
                          created_by TEXT, -- Added created_by field
                          is_uploaded INTEGER DEFAULT 0,
                          upload_error TEXT,
                          created_at INTEGER,
                          uploaded_at INTEGER
                        )`,
                        [],
                        () => {
                          console.log("Old meter data table created successfully with category and created_by fields")

                          // Create new meter data table for offline storage
                          tx.executeSql(
                            `CREATE TABLE IF NOT EXISTS new_meter_data (
                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                              account_id TEXT,
                              old_meter_id INTEGER,
                              image_1_new TEXT,
                              image_2_new TEXT,
                              meter_make_new TEXT,
                              serial_no_new TEXT,
                              mfd_year_new TEXT,
                              initial_reading_kwh TEXT, -- Added initial_reading_kwh field
                              initial_reading_kvah TEXT, -- Added initial_reading_kvah field
                              lat TEXT,
                              lon TEXT,
                              created_by TEXT, -- Added created_by field
                              is_uploaded INTEGER DEFAULT 0,
                              upload_error TEXT,
                              created_at INTEGER,
                              uploaded_at INTEGER,
                              FOREIGN KEY (old_meter_id) REFERENCES old_meter_data (id)
                            )`,
                            [],
                            () => {
                              console.log("New meter data table created successfully with all required fields")
                              console.log("All database tables initialized successfully")
                              resolve()
                            },
                            (_, error) => {
                              console.error("Error creating new meter data table", error)
                              reject(error)
                            },
                          )
                        },
                        (_, error) => {
                          console.error("Error creating old meter data table", error)
                          reject(error)
                        },
                      )
                    },
                    (_, error) => {
                      console.error("Error creating sync metadata table", error)
                      reject(error)
                    },
                  )
                },
                (_, error) => {
                  console.error("Error creating unused meter serial numbers table", error)
                  reject(error)
                },
              )
            },
            (_, error) => {
              console.error("Error creating customer data table", error)
              reject(error)
            },
          )
        },
        (txError) => {
          console.error("Transaction error during database initialization:", txError)
          reject(txError)
        },
        () => {
          console.log("Database initialization transaction completed successfully")
        },
      )
    } catch (error) {
      console.error("Error initializing database:", error)
      reject(error)
    }
  })
}

// Verify table exists before operations
const verifyTableExists = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      database.transaction((tx) => {
        tx.executeSql(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='customer_data'",
          [],
          (_, { rows }) => {
            if (rows.length > 0) {
              console.log("customer_data table exists")
              resolve(true)
            } else {
              console.error("customer_data table does not exist")
              reject(new Error("customer_data table does not exist"))
            }
          },
          (_, error) => {
            console.error("Error checking table existence", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in verifyTableExists:", error)
      reject(error)
    }
  })
}

// Clear all customer data
export const clearCustomerData = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()
      await verifyTableExists()

      database.transaction((tx) => {
        tx.executeSql(
          "DELETE FROM customer_data",
          [],
          (_, result) => {
            console.log("All customer data cleared successfully")
            resolve(result)
          },
          (_, error) => {
            console.error("Error clearing customer data", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in clearCustomerData:", error)
      reject(error)
    }
  })
}

// Update the insertCustomerData function to provide better error handling and logging
export const insertCustomerData = (customerData) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure database is initialized
      const database = await getDatabase()

      // Verify table exists
      await verifyTableExists()

      // Check if customerData is defined
      if (!customerData) {
        const error = new Error("Customer data is undefined")
        console.error("Customer data is undefined")
        reject(error)
        return
      }

      // Ensure all required fields have at least default values
      const safeCustomerData = {
        id: customerData.id || 0,
        account_id: customerData.account_id?.toString() || "",
        rr_no: customerData.rr_no?.toString() || "",
        consumer_name: customerData.consumer_name?.toString() || "",
        consumer_address: customerData.consumer_address?.toString() || "",
        division: customerData.division?.toString() || "",
        section: customerData.section?.toString() || "",
        sub_division: customerData.sub_division?.toString() || "",
        phase_type: customerData.phase_type?.toString() || "",
        previous_final_reading: customerData.previous_final_reading?.toString() || "0",
        billed_date: customerData.billed_date?.toString() || "0",
        last_updated: Date.now(),
      }

      // Log the data being inserted for debugging
      console.log(`Inserting customer data for ID: ${safeCustomerData.id}, Account: ${safeCustomerData.account_id}`)

      database.transaction(
        (tx) => {
          tx.executeSql(
            `INSERT OR REPLACE INTO customer_data 
           (id, account_id, rr_no, consumer_name, consumer_address, division, section, sub_division, phase_type, previous_final_reading, billed_date, last_updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              safeCustomerData.id,
              safeCustomerData.account_id,
              safeCustomerData.rr_no,
              safeCustomerData.consumer_name,
              safeCustomerData.consumer_address,
              safeCustomerData.division,
              safeCustomerData.section,
              safeCustomerData.sub_division,
              safeCustomerData.phase_type,
              safeCustomerData.previous_final_reading,
              safeCustomerData.billed_date,
              safeCustomerData.last_updated,
            ],
            (_, result) => {
              console.log(`Customer data inserted successfully for ID: ${safeCustomerData.id}`)
              resolve(result)
            },
            (_, error) => {
              // Provide detailed error information
              const errorMsg = error
                ? error.message || error.toString() || JSON.stringify(error)
                : "Unknown database error"
              console.error(`Error inserting customer data for ID: ${safeCustomerData.id}`, errorMsg)
              console.error("Full error object:", error)
              console.error("Customer data that failed:", JSON.stringify(safeCustomerData, null, 2))
              reject(new Error(errorMsg))
            },
          )
        },
        (txError) => {
          // Handle transaction errors with better logging
          const txErrorMsg = txError
            ? txError.message || txError.toString() || JSON.stringify(txError)
            : "Transaction failed"
          console.error("Transaction error during customer data insertion:", txErrorMsg)
          console.error("Full transaction error object:", txError)
          console.error("Customer data that caused transaction error:", JSON.stringify(safeCustomerData, null, 2))
          reject(new Error(txErrorMsg))
        },
      )
    } catch (error) {
      console.error("Error in insertCustomerData:", error)
      reject(error)
    }
  })
}

export const getCustomerData = (accountId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()
      await verifyTableExists()

      database.transaction((tx) => {
        tx.executeSql(
          "SELECT * FROM customer_data WHERE account_id = ?",
          [accountId],
          (_, { rows }) => {
            if (rows.length > 0) {
              resolve(rows.item(0))
            } else {
              resolve(null)
            }
          },
          (_, error) => {
            console.error("Error fetching customer data", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in getCustomerData:", error)
      reject(error)
    }
  })
}

// Add a new function to get customers by section code
export const getCustomersBySection = (sectionCode) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()
      await verifyTableExists()

      database.transaction((tx) => {
        tx.executeSql(
          "SELECT * FROM customer_data WHERE section = ?",
          [sectionCode],
          (_, { rows }) => {
            const customers = []
            for (let i = 0; i < rows.length; i++) {
              customers.push(rows.item(i))
            }
            resolve(customers)
          },
          (_, error) => {
            console.error("Error fetching customers by section", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in getCustomersBySection:", error)
      reject(error)
    }
  })
}

export const searchCustomersBySection = (query, sectionCode) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()
      await verifyTableExists()

      database.transaction((tx) => {
        tx.executeSql(
          `SELECT * FROM customer_data 
           WHERE (account_id LIKE ? OR rr_no LIKE ? OR consumer_name LIKE ?) AND section = ?
           ORDER BY consumer_name ASC
           LIMIT 50`,
          [`%${query}%`, `%${query}%`, `%${query}%`, sectionCode],
          (_, { rows }) => {
            resolve(Array.from({ length: rows.length }, (_, i) => rows.item(i)))
          },
          (_, error) => {
            console.error("Error searching customers by section", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in searchCustomersBySection:", error)
      reject(error)
    }
  })
}

export const searchCustomers = (query) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()
      await verifyTableExists()

      database.transaction((tx) => {
        tx.executeSql(
          `SELECT * FROM customer_data 
           WHERE account_id LIKE ? OR rr_no LIKE ? OR consumer_name LIKE ?
           ORDER BY consumer_name ASC
           LIMIT 50`,
          [`%${query}%`, `%${query}%`, `%${query}%`],
          (_, { rows }) => {
            resolve(Array.from({ length: rows.length }, (_, i) => rows.item(i)))
          },
          (_, error) => {
            console.error("Error searching customers", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in searchCustomers:", error)
      reject(error)
    }
  })
}

export const clearExpiredData = () => {
  const expirationTime = Date.now() - 12 * 60 * 60 * 1000 // 12 hours ago
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()
      await verifyTableExists()

      database.transaction((tx) => {
        tx.executeSql(
          "DELETE FROM customer_data WHERE last_updated < ?",
          [expirationTime],
          (_, result) => {
            console.log("Expired data cleared successfully")
            resolve(result)
          },
          (_, error) => {
            console.error("Error clearing expired data", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in clearExpiredData:", error)
      reject(error)
    }
  })
}

// Functions for unused meter serial numbers

export const saveUnusedMeterSerialNumbers = (serialNumbers, isFullSync = false) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      // Check if serialNumbers is valid
      if (!serialNumbers || !Array.isArray(serialNumbers)) {
        console.error("Invalid serial numbers array:", serialNumbers)
        reject(new Error("Invalid serial numbers array"))
        return
      }

      // If the array is empty and it's not a full sync, just resolve
      if (serialNumbers.length === 0 && !isFullSync) {
        console.log("No serial numbers to save")
        resolve()
        return
      }

      database.transaction((tx) => {
        // If it's a full sync, clear all existing data first
        if (isFullSync) {
          tx.executeSql(
            "DELETE FROM unused_meter_serial_numbers",
            [],
            () => {
              console.log("Cleared all unused meter serial numbers for full sync")

              // If there are no serial numbers to add, we're done
              if (serialNumbers.length === 0) {
                console.log("No serial numbers to add after clearing")

                // Update the last sync timestamp even if no serial numbers were added
                const now = Date.now()
                tx.executeSql(
                  `INSERT OR REPLACE INTO sync_metadata (key, value, last_updated)
                   VALUES ('last_meter_sync', ?, ?)`,
                  [now.toString(), now],
                  () => {
                    console.log("Updated last meter sync timestamp")
                    resolve()
                  },
                  (_, error) => {
                    console.error("Error updating last meter sync timestamp:", error)
                    reject(error)
                  },
                )
                return
              }
            },
            (_, error) => {
              console.error("Error clearing unused meter serial numbers:", error)
              reject(error)
              return
            },
          )
        }

        // If there are serial numbers to add, insert them
        if (serialNumbers.length > 0) {
          // Insert or update each serial number
          const now = Date.now()
          const promises = serialNumbers.map((serialNumber) => {
            return new Promise((innerResolve, innerReject) => {
              // Skip empty serial numbers
              if (!serialNumber || serialNumber.trim() === "") {
                innerResolve()
                return
              }

              tx.executeSql(
                `INSERT OR REPLACE INTO unused_meter_serial_numbers 
                 (serial_number, is_valid, is_used, last_updated)
                 VALUES (?, 1, 0, ?)`,
                [serialNumber, now],
                (_, result) => {
                  innerResolve(result)
                },
                (_, error) => {
                  console.error(`Error inserting serial number ${serialNumber}:`, error)
                  innerReject(error)
                },
              )
            })
          })

          Promise.all(promises)
            .then(() => {
              console.log(`Saved ${serialNumbers.length} unused meter serial numbers`)

              // Update the last sync timestamp
              tx.executeSql(
                `INSERT OR REPLACE INTO sync_metadata (key, value, last_updated)
                 VALUES ('last_meter_sync', ?, ?)`,
                [now.toString(), now],
                () => {
                  console.log("Updated last meter sync timestamp")
                  resolve()
                },
                (_, error) => {
                  console.error("Error updating last meter sync timestamp:", error)
                  reject(error)
                },
              )
            })
            .catch((error) => {
              console.error("Error saving unused meter serial numbers:", error)
              reject(error)
            })
        } else {
          // No serial numbers to add, just update the timestamp
          const now = Date.now()
          tx.executeSql(
            `INSERT OR REPLACE INTO sync_metadata (key, value, last_updated)
             VALUES ('last_meter_sync', ?, ?)`,
            [now.toString(), now],
            () => {
              console.log("Updated last meter sync timestamp (no serial numbers to add)")
              resolve()
            },
            (_, error) => {
              console.error("Error updating last meter sync timestamp:", error)
              reject(error)
            },
          )
        }
      })
    } catch (error) {
      console.error("Error in saveUnusedMeterSerialNumbers:", error)
      reject(error)
    }
  })
}

export const removeUnusedMeterSerialNumbers = (serialNumbers) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      if (!serialNumbers || serialNumbers.length === 0) {
        resolve()
        return
      }

      database.transaction((tx) => {
        // Create placeholders for the IN clause
        const placeholders = serialNumbers.map(() => "?").join(",")

        tx.executeSql(
          `DELETE FROM unused_meter_serial_numbers WHERE serial_number IN (${placeholders})`,
          serialNumbers,
          (_, result) => {
            console.log(`Removed ${result.rowsAffected} unused meter serial numbers`)
            resolve(result)
          },
          (_, error) => {
            console.error("Error removing unused meter serial numbers", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in removeUnusedMeterSerialNumbers:", error)
      reject(error)
    }
  })
}

export const markSerialNumbersAsUsed = (serialNumbers) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      if (!serialNumbers || serialNumbers.length === 0) {
        resolve()
        return
      }

      database.transaction((tx) => {
        // Create placeholders for the IN clause
        const placeholders = serialNumbers.map(() => "?").join(",")
        const now = Date.now()

        tx.executeSql(
          `UPDATE unused_meter_serial_numbers 
           SET is_used = 1, last_updated = ? 
           WHERE serial_number IN (${placeholders})`,
          [now, ...serialNumbers],
          (_, result) => {
            console.log(`Marked ${result.rowsAffected} serial numbers as used`)
            resolve(result)
          },
          (_, error) => {
            console.error("Error marking serial numbers as used", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in markSerialNumbersAsUsed:", error)
      reject(error)
    }
  })
}

export const isValidMeterSerialNumber = (serialNumber) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      database.transaction((tx) => {
        tx.executeSql(
          "SELECT * FROM unused_meter_serial_numbers WHERE serial_number = ? AND is_valid = 1 AND is_used = 0",
          [serialNumber],
          (_, { rows }) => {
            resolve(rows.length > 0)
          },
          (_, error) => {
            console.error("Error checking meter serial number validity", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in isValidMeterSerialNumber:", error)
      reject(error)
    }
  })
}

export const getLastMeterSyncTimestamp = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      database.transaction((tx) => {
        tx.executeSql(
          'SELECT value FROM sync_metadata WHERE key = "last_meter_sync"',
          [],
          (_, { rows }) => {
            if (rows.length > 0) {
              resolve(Number.parseInt(rows.item(0).value, 10))
            } else {
              resolve(0) // No previous sync
            }
          },
          (_, error) => {
            console.error("Error getting last meter sync timestamp", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in getLastMeterSyncTimestamp:", error)
      reject(error)
    }
  })
}

export const getAllUnusedMeterSerialNumbers = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

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
            console.error("Error getting all unused meter serial numbers", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in getAllUnusedMeterSerialNumbers:", error)
      reject(error)
    }
  })
}

// Functions for offline meter data storage

export const saveOldMeterData = (meterData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      if (!meterData) {
        console.error("Meter data is null or undefined")
        reject(new Error("Meter data is required"))
        return
      }

      if (!meterData.account_id) {
        console.error("Account ID is missing from meter data")
        reject(new Error("Account ID is required"))
        return
      }

      database.transaction(
        (tx) => {
          tx.executeSql(
            `INSERT INTO old_meter_data 
             (account_id, serial_no_old, mfd_year_old, final_reading, meter_make_old, category, image_1_old, image_2_old, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              meterData.account_id,
              meterData.serial_no_old || "",
              meterData.mfd_year_old || "",
              meterData.final_reading || "",
              meterData.meter_make_old || "",
              meterData.category || "",
              meterData.image_1_old || null,
              meterData.image_2_old || null,
              meterData.created_by || "system",
              Date.now(),
            ],
            (_, result) => {
              console.log("[v0] Old meter data saved successfully with insertId:", result.insertId)
              resolve(result.insertId)
            },
            (_, error) => {
              console.error("[v0] SQLite error saving old meter data:", error)
              console.error("[v0] Error code:", error.code)
              console.error("[v0] Error message:", error.message)
              reject(new Error(`Failed to save old meter data: ${error.message}`))
            },
          )
        },
        (txError) => {
          console.error("[v0] Transaction error saving old meter data:", txError)
          reject(new Error(`Transaction failed: ${txError.message}`))
        },
        () => {
          console.log("[v0] Old meter save transaction completed")
        },
      )
    } catch (error) {
      console.error("[v0] Exception in saveOldMeterData:", error)
      reject(error)
    }
  })
}

export const saveNewMeterData = (meterData, oldMeterId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      database.transaction((tx) => {
        tx.executeSql(
          `INSERT INTO new_meter_data 
           (account_id, old_meter_id, image_1_new, image_2_new, meter_make_new, serial_no_new, mfd_year_new, initial_reading_kwh, initial_reading_kvah, lat, lon, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            meterData.account_id,
            oldMeterId,
            meterData.image_1_new,
            meterData.image_2_new,
            meterData.meter_make_new,
            meterData.serial_no_new,
            meterData.mfd_year_new,
            meterData.initial_reading_kwh,
            meterData.initial_reading_kvah,
            meterData.lat,
            meterData.lon,
            meterData.created_by,
            Date.now(),
          ],
          (_, result) => {
            console.log("New meter data saved successfully")
            resolve(result.insertId)
          },
          (_, error) => {
            console.error("Error saving new meter data", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in saveNewMeterData:", error)
      reject(error)
    }
  })
}

export const getPendingMeterData = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      database.transaction((tx) => {
        tx.executeSql(
          `SELECT 
             o.id as old_id,
             o.account_id,
             o.serial_no_old,
             o.mfd_year_old,
             o.final_reading,
             o.meter_make_old,
             o.category,
             o.image_1_old,
             o.image_2_old,
             o.created_by,
             n.id as new_id,
             n.image_1_new,
             n.image_2_new,
             n.meter_make_new,
             n.serial_no_new,
             n.mfd_year_new,
             n.initial_reading_kwh,
             n.initial_reading_kvah,
             n.lat,
             n.lon,
             n.created_by
           FROM old_meter_data o
           LEFT JOIN new_meter_data n ON o.id = n.old_meter_id
           WHERE o.is_uploaded = 0`,
          [],
          (_, { rows }) => {
            const pendingData = []
            for (let i = 0; i < rows.length; i++) {
              pendingData.push(rows.item(i))
            }
            resolve(pendingData)
          },
          (_, error) => {
            console.error("Error getting pending meter data", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in getPendingMeterData:", error)
      reject(error)
    }
  })
}

export const markMeterDataAsUploaded = (oldId, newId = null) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      database.transaction((tx) => {
        // Mark old meter data as uploaded
        tx.executeSql(
          "UPDATE old_meter_data SET is_uploaded = 1, uploaded_at = ? WHERE id = ?",
          [Date.now(), oldId],
          (_, result) => {
            console.log("Old meter data marked as uploaded")

            // Mark new meter data as uploaded if provided
            if (newId) {
              tx.executeSql(
                "UPDATE new_meter_data SET is_uploaded = 1, uploaded_at = ? WHERE id = ?",
                [Date.now(), newId],
                (_, result) => {
                  console.log("New meter data marked as uploaded")
                  resolve(result)
                },
                (_, error) => {
                  console.error("Error marking new meter data as uploaded", error)
                  reject(error)
                },
              )
            } else {
              resolve(result)
            }
          },
          (_, error) => {
            console.error("Error marking old meter data as uploaded", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in markMeterDataAsUploaded:", error)
      reject(error)
    }
  })
}

export const markMeterDataAsFailed = (oldId, newId = null, error) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getDatabase()

      database.transaction((tx) => {
        // Mark old meter data as failed
        tx.executeSql(
          "UPDATE old_meter_data SET upload_error = ? WHERE id = ?",
          [error, oldId],
          (_, result) => {
            console.log("Old meter data marked as failed")

            // Mark new meter data as failed if provided
            if (newId) {
              tx.executeSql(
                "UPDATE new_meter_data SET upload_error = ? WHERE id = ?",
                [error, newId],
                (_, result) => {
                  console.log("New meter data marked as failed")
                  resolve(result)
                },
                (_, error) => {
                  console.error("Error marking new meter data as failed", error)
                  reject(error)
                },
              )
            } else {
              resolve(result)
            }
          },
          (_, error) => {
            console.error("Error marking old meter data as failed", error)
            reject(error)
          },
        )
      })
    } catch (error) {
      console.error("Error in markMeterDataAsFailed:", error)
      reject(error)
    }
  })
}
