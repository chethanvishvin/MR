import SQLite from "react-native-sqlite-storage"

// Enable debugging and promises for SQLite
SQLite.DEBUG(true)
SQLite.enablePromise(true)

let oldMeterCacheDb = null

/**
 * Initializes the database connection for the old meter cache.
 * Opens a new database file named "OldMeterCacheDB".
 * @returns {Promise<SQLite.SQLiteDatabase>} A promise that resolves with the database instance.
 */
const initializeOldMeterCacheDatabase = () => {
  return new Promise((resolve, reject) => {
    if (oldMeterCacheDb) {
      resolve(oldMeterCacheDb)
      return
    }

    SQLite.openDatabase(
      {
        name: "OldMeterCacheDB", // A new, dedicated database file for caching
        location: "default",
      },
      (database) => {
        console.log("Old Meter Cache Database opened successfully")
        oldMeterCacheDb = database
        resolve(database)
      },
      (error) => {
        console.error("Error opening Old Meter Cache Database", error)
        reject(error)
      },
    )
  })
}

/**
 * Gets the database instance for the old meter cache, ensuring it's initialized.
 * @returns {Promise<SQLite.SQLiteDatabase>} A promise that resolves with the database instance.
 */
export const getOldMeterCacheDatabase = async () => {
  if (!oldMeterCacheDb) {
    await initializeOldMeterCacheDatabase()
  }
  return oldMeterCacheDb
}

/**
 * Initializes the 'old_meter_cache' table within the OldMeterCacheDB.
 * This table stores in-progress old meter data for auto-population.
 * @returns {Promise<void>} A promise that resolves when the table is created.
 */
export const initOldMeterCacheTable = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getOldMeterCacheDatabase()
      database.transaction(
        (tx) => {
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS old_meter_cache (
              account_id TEXT PRIMARY KEY,
              photo1 TEXT,
              photo2 TEXT,
              meterMake TEXT,
              serialNumber TEXT,
              manufactureYear TEXT,
              finalReading TEXT,
              meterCategory TEXT,
              previousReading TEXT,
              previousReadingDate TEXT,
              last_updated INTEGER
            )`,
            [],
            () => {
              console.log("Old meter cache table created successfully")
              resolve()
            },
            (_, error) => {
              console.error("Error creating old meter cache table", error)
              reject(error)
            },
          )
        },
        (txError) => {
          console.error("Transaction error during old meter cache table initialization:", txError)
          reject(txError)
        },
        () => {
          console.log("Old meter cache table initialization transaction completed successfully")
        },
      )
    } catch (error) {
      console.error("Error initializing old meter cache database:", error)
      reject(error)
    }
  })
}

/**
 * Saves or updates old meter data in the cache for a specific account ID.
 * @param {object} meterData - The old meter data object to save.
 * @param {string} meterData.account_id - The account ID associated with the meter data.
 * @returns {Promise<SQLite.ResultSet>} A promise that resolves with the result of the database operation.
 */
export const saveOldMeterCache = (meterData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getOldMeterCacheDatabase()
      await initOldMeterCacheTable() // Ensure table exists

      if (!meterData || !meterData.account_id) {
        reject(new Error("Invalid meter data or missing account_id for cache"))
        return
      }

      const now = Date.now()
      database.transaction(
        (tx) => {
          tx.executeSql(
            `INSERT OR REPLACE INTO old_meter_cache 
             (account_id, photo1, photo2, meterMake, serialNumber, manufactureYear, finalReading, meterCategory, previousReading, previousReadingDate, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              meterData.account_id,
              meterData.photo1 || null,
              meterData.photo2 || null,
              meterData.meterMake || "",
              meterData.serialNumber || "",
              meterData.manufactureYear || "",
              meterData.finalReading || "",
              meterData.meterCategory || "",
              meterData.previousReading || "",
              meterData.previousReadingDate || "",
              now,
            ],
            (_, result) => {
              console.log(`Old meter data cached successfully for account_id: ${meterData.account_id}`)
              resolve(result)
            },
            (_, error) => {
              console.error(`Error saving old meter data to cache for account_id: ${meterData.account_id}`, error)
              reject(error)
            },
          )
        },
        (txError) => {
          console.error("Transaction error during old meter cache save:", txError)
          reject(txError)
        },
      )
    } catch (error) {
      console.error("Error in saveOldMeterCache:", error)
      reject(error)
    }
  })
}

/**
 * Retrieves old meter data from the cache for a specific account ID.
 * @param {string} accountId - The account ID to retrieve data for.
 * @returns {Promise<object|null>} A promise that resolves with the cached meter data object, or null if not found.
 */
export const getOldMeterCache = (accountId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getOldMeterCacheDatabase()
      await initOldMeterCacheTable() // Ensure table exists

      database.transaction(
        (tx) => {
          tx.executeSql(
            "SELECT * FROM old_meter_cache WHERE account_id = ?",
            [accountId],
            (_, { rows }) => {
              if (rows.length > 0) {
                console.log(`Retrieved old meter data from cache for account_id: ${accountId}`)
                resolve(rows.item(0))
              } else {
                console.log(`No old meter data found in cache for account_id: ${accountId}`)
                resolve(null)
              }
            },
            (_, error) => {
              console.error(`Error fetching old meter data from cache for account_id: ${accountId}`, error)
              reject(error)
            },
          )
        },
        (txError) => {
          console.error("Transaction error during old meter cache fetch:", txError)
          reject(txError)
        },
      )
    } catch (error) {
      console.error("Error in getOldMeterCache:", error)
      reject(error)
    }
  })
}

/**
 * Clears old meter data from the cache for a specific account ID.
 * This should be called after successful submission of both old and new meter data.
 * @param {string} accountId - The account ID for which to clear the cache.
 * @returns {Promise<SQLite.ResultSet>} A promise that resolves with the result of the database operation.
 */
export const clearOldMeterCache = (accountId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const database = await getOldMeterCacheDatabase()
      await initOldMeterCacheTable() // Ensure table exists

      database.transaction(
        (tx) => {
          tx.executeSql(
            "DELETE FROM old_meter_cache WHERE account_id = ?",
            [accountId],
            (_, result) => {
              console.log(`Cleared old meter cache for account_id: ${accountId}. Rows affected: ${result.rowsAffected}`)
              resolve(result)
            },
            (_, error) => {
              console.error(`Error clearing old meter cache for account_id: ${accountId}`, error)
              reject(error)
            },
          )
        },
        (txError) => {
          console.error("Transaction error during old meter cache clear:", txError)
          reject(txError)
        },
      )
    } catch (error) {
      console.error("Error in clearOldMeterCache:", error)
      reject(error)
    }
  })
}
