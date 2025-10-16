import SQLite from "react-native-sqlite-storage"

const db = SQLite.openDatabase(
  {
    name: "MeterReadingDB",
    location: "default",
  },
  () => console.log("Meter database opened successfully"),
  (error) => console.error("Error opening meter database", error),
)

export const initMeterDatabase = () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS UnusedMeterSerialNumbers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_no TEXT UNIQUE,
          box_id TEXT,
          division TEXT,
          meter_type TEXT,
          dc_no TEXT,
          contractor_id TEXT,
          last_updated TEXT
        )`,
        [],
        () => {
          console.log("UnusedMeterSerialNumbers table created successfully")
          resolve()
        },
        (_, error) => {
          console.error("Error creating UnusedMeterSerialNumbers table", error)
          reject(error)
        },
      )
    })
  })
}

export const saveUnusedMeterSerialNumbers = (serialNumbers, isFullSync = false) => {
  return new Promise((resolve, reject) => {
    if (!serialNumbers || !Array.isArray(serialNumbers)) {
      reject(new Error("Invalid serial numbers array"))
      return
    }

    db.transaction((tx) => {
      if (isFullSync) {
        tx.executeSql(
          "DELETE FROM UnusedMeterSerialNumbers",
          [],
          () => {
            console.log("Cleared all unused meter serial numbers for full sync")
          },
          (_, error) => {
            console.error("Error clearing unused meter serial numbers:", error)
            reject(error)
            return
          },
        )
      }

      const now = new Date().toISOString()
      serialNumbers.forEach((serialNumber) => {
        tx.executeSql(
          `INSERT OR IGNORE INTO UnusedMeterSerialNumbers (serial_no, box_id, division, meter_type, dc_no, contractor_id, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            serialNumber.unused_meter_serial_no,
            serialNumber.box_id,
            serialNumber.division,
            serialNumber.meter_type,
            serialNumber.dc_no,
            serialNumber.contractor_id,
            now,
          ],
          (_, result) => {
            console.log(`Inserted serial number ${serialNumber.unused_meter_serial_no}`)
          },
          (_, error) => {
            console.error(`Error inserting serial number ${serialNumber.unused_meter_serial_no}:`, error)
          },
        )
      })
      resolve()
    })
  })
}

export const removeUnusedMeterSerialNumbers = (serialNumbers) => {
  return new Promise((resolve, reject) => {
    if (!serialNumbers || serialNumbers.length === 0) {
      resolve()
      return
    }

    db.transaction((tx) => {
      serialNumbers.forEach((serialNumber) => {
        tx.executeSql(
          "DELETE FROM UnusedMeterSerialNumbers WHERE serial_no = ?",
          [serialNumber],
          (_, result) => {
            console.log(`Removed serial number ${serialNumber}`)
          },
          (_, error) => {
            console.error(`Error removing serial number ${serialNumber}:`, error)
          },
        )
      })
      resolve()
    })
  })
}

export const getAllUnusedMeterSerialNumbers = () => {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        "SELECT serial_no FROM UnusedMeterSerialNumbers",
        [],
        (_, { rows }) => {
          const serialNumbers = []
          for (let i = 0; i < rows.length; i++) {
            serialNumbers.push(rows.item(i).serial_no)
          }
          resolve(serialNumbers)
        },
        (_, error) => {
          console.error("Error getting all unused meter serial numbers", error)
          reject(error)
        },
      )
    })
  })
}

export const getMeterSyncStats = () => {
  return new Promise((resolve, reject) => {
    // Placeholder implementation - replace with actual logic if needed
    const stats = {
      totalSerialNumbers: 0,
      lastSyncTimestamp: null,
    }
    resolve(stats)
  })
}

