const dbPool = require('../../database/db');
const moment = require('moment');
const mysql = require('mysql2');
const { setCacheData, getCacheData } = require('../../../shared/redis/Redis');
const h3 = require('h3-js');

class rideModel {

    static generateUniqueReferenceId() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const date =
            pad(now.getDate()) +
            pad(now.getMonth() + 1) +
            String(now.getFullYear()).slice(-2);
        const time =
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
        const random =
            Math.floor(Math.random() * 90 + 10).toString() +
            Math.floor(Math.random() * 90 + 10).toString();
        return `${date}-${time}-${random}`;
    }

    static async generateAppTransactionReference(modPrefix = "REF", addProjectPrefix = true) {
        let ref = "";
        return `${ref}${modPrefix}-${this.generateUniqueReferenceId()}`;
    }
    static async createRide(rider_id, rideData) {
        const {
            pickup_address,
            pickup_latitude,
            pickup_longitude,
            drop_address,
            drop_latitude,
            drop_longitude,
            vehicle_type,
            payment_method
        } = rideData;

        const rideReference = await this.generateUniqueReferenceId();

        const sql = `
            INSERT INTO rides (
                ride_reference,
                rider_id,
                pickup_address,
                pickup_latitude,
                pickup_longitude,
                drop_address,
                drop_latitude,
                drop_longitude,
                vehicle_type,
                payment_method,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            String(rideReference),
            Number(rider_id),
            pickup_address,
            Number(pickup_latitude),
            Number(pickup_longitude),
            drop_address,
            Number(drop_latitude),
            Number(drop_longitude),
            vehicle_type,
            payment_method || 'cash',
            'pending'
        ];

        console.log('Ride reference:', rideReference);
        console.log('Parameter count:', params.length);

        try {
            const [result] = await dbPool.execute(sql, params);

            return {
                ride_id: result.insertId,
                ride_reference: rideReference
            };
        } catch (error) {
            throw error;
        }
    }

    // Get ride details for the authenticated rider
    static async getRideById(rideId, riderId) {
        const sql = `
            SELECT *
            FROM rides
            WHERE ride_id = ?
              AND rider_id = ?
            LIMIT 1
        `;

        const [rows] = await dbPool.execute(sql, [rideId, riderId]);

        return rows.length ? rows[0] : null;
    }
    static async getNearbyDrivers(h3Cells) {
        if (!h3Cells.length) return [];

        const placeholders = h3Cells.map(() => '?').join(',');

        const sql = `
            SELECT
                id AS driver_id,
                first_name,
                last_name,
                last_location_latitude AS latitude,
                last_location_longitude AS longitude,
                h3_index
            FROM users
            WHERE user_type = 3
            AND status = 1
            AND is_online = 1
            AND h3_index IN (${placeholders})
            AND last_location_latitude IS NOT NULL
            AND last_location_longitude IS NOT NULL
        `;

        const [rows] = await dbPool.query(sql, h3Cells);
        return rows;
    };
    static async getSettings() {
        const [rows] = await dbPool.query(
            `SELECT setting_key, setting_value, setting_type
             FROM settings
             WHERE status = 1
             ORDER BY id ASC`
        );
    
        const settings = {};
    
        for (const row of rows) {
            let value = row.setting_value;
    
            if (row.setting_type === 'number') {
                value = Number(value);
            } else if (row.setting_type === 'boolean') {
                value = value === 'true' || value === '1';
            } else if (row.setting_type === 'json') {
                value = JSON.parse(value);
            }
    
            settings[row.setting_key] = value;
        }
    
        return settings;
    
    }

    static async updateDriverLocation( driverId,latitude,longitude,h3Index) {
        const connection = await dbPool.getConnection();

        try {
            await connection.beginTransaction();

            // Verify that the authenticated user is an active driver.
            const [drivers] = await connection.query(
                `SELECT id
                 FROM users
                 WHERE id = ?
                   AND user_type = 3
                   AND status = 1
                 LIMIT 1`,
                [driverId]
            );

            if (drivers.length === 0) {
                await connection.rollback();
                return false;
            }

            // Insert a new location history record.
            await connection.query(
                `INSERT INTO driver_locations
                    (driver_id, latitude, longitude, created_at)
                 VALUES (?, ?, ?, NOW())`,
                [driverId, latitude, longitude]
            );

            // Update the driver's latest location.
            await connection.query(
                `UPDATE users
                 SET last_location_latitude = ?,
                     last_location_longitude = ?,
                     last_location_at = NOW(),
                     h3_index = ?
                 WHERE id = ?`,
                [latitude, longitude, h3Index, driverId]
            );

            await connection.commit();
            return true;

        } catch (error) {
            await connection.rollback();
            throw error;

        } finally {
            connection.release();
        }
    }


}

module.exports = rideModel;