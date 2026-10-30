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
    static async createRide(rider_id, rideData, fareData) {

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
                distance_km,
                estimated_fare,
                vehicle_type,
                payment_method,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;

        const params = [
            rideReference,
            Number(rider_id),
            pickup_address,
            Number(pickup_latitude),
            Number(pickup_longitude),
            drop_address,
            Number(drop_latitude),
            Number(drop_longitude),
            fareData.trip_distance_km,
            fareData.total_fare,
            vehicle_type,
            payment_method || 'cash'
        ];

        const [result] = await dbPool.execute(sql, params);

        return {
            ride_id: result.insertId,
            ride_reference: rideReference
        };
    }
    static async createDriverQueue(rideId, drivers) {
        if (!drivers.length) return;
        const values = drivers.map((driver, index) => [rideId,driver.driver_id,index + 1,'queued']);
        const sql = `
            INSERT INTO ride_requests
            (ride_id, driver_id, request_order, status)
            VALUES ?
        `;
        await dbPool.query(sql, [values]);
    }
    static async getNextDriverRequest(rideId) {

        const connection = await dbPool.getConnection();

        try {
            await connection.beginTransaction();

            const [rides] = await connection.query(
                `SELECT ride_id, status
                FROM rides
                WHERE ride_id = ?
                FOR UPDATE`,
                [rideId]
            );

            if (!rides.length || rides[0].status !== 'pending') {
                await connection.rollback();
                return null;
            }

            // Expire old request
            await connection.query(
                `UPDATE ride_requests
                SET status = 'expired',
                    responded_at = NOW()
                WHERE ride_id = ?
                AND status = 'pending'
                AND expires_at <= NOW()`,
                [rideId]
            );

            // Check whether another request is active
            const [active] = await connection.query(
                `SELECT id
                FROM ride_requests
                WHERE ride_id = ?
                AND status = 'pending'
                AND expires_at > NOW()
                LIMIT 1`,
                [rideId]
            );

            if (active.length) {
                await connection.commit();
                return null;
            }

            const [requests] = await connection.query(
                `SELECT
                    rr.id AS request_id,
                    rr.ride_id,
                    rr.driver_id,
                    u.fcm_token,
                    r.pickup_address,
                    r.drop_address,
                    r.estimated_fare
                FROM ride_requests rr
                INNER JOIN rides r ON r.ride_id = rr.ride_id
                INNER JOIN users u ON u.id = rr.driver_id
                INNER JOIN vehicles v ON v.user_id = u.id
                WHERE rr.ride_id = ?
                AND rr.status = 'queued'
                AND u.user_type = 3
                AND u.status = 1
                AND u.is_online = 1
                AND u.deleted_at IS NULL
                AND u.current_ride_id IS NULL
                AND u.fcm_token IS NOT NULL
                AND u.fcm_token != ''
                AND v.status = 1
                AND v.deleted_at IS NULL
                AND v.vehicle_type = r.vehicle_type
                ORDER BY rr.request_order ASC
                LIMIT 1
                FOR UPDATE`,
                [rideId]
            );

            if (!requests.length) {
                await connection.commit();
                return null;
            }

            const request = requests[0];

            await connection.query(
                `UPDATE ride_requests
                SET status = 'pending',
                    sent_at = NOW(),
                    expires_at = DATE_ADD(NOW(), INTERVAL 30 SECOND)
                WHERE id = ?
                AND status = 'queued'`,
                [request.request_id]
            );

            await connection.commit();

            return request;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
    static async expireRideRequest(requestId) {

        const [result] = await dbPool.query(
            `UPDATE ride_requests
            SET status = 'expired',
                responded_at = NOW()
            WHERE id = ?
            AND status = 'pending'`,
            [requestId]
        );

        return result.affectedRows > 0;
    }
    static async rejectRideRequest(requestId, driverId) {

        const [result] = await dbPool.query(
            `UPDATE ride_requests
                SET status = 'rejected',
                    responded_at = NOW()
                WHERE id = ?
                AND driver_id = ?
                AND status = 'pending'
                AND expires_at > NOW()`,
            [requestId, driverId]
        );

        return result.affectedRows > 0;
    }
    static async acceptRideRequest(requestId, driverId) {
        const connection = await dbPool.getConnection();
        try {
            await connection.beginTransaction();
            const [requestRows] = await connection.query(
                `SELECT ride_id, status, expires_at
                FROM ride_requests
                WHERE id = ?
                AND driver_id = ?
                FOR UPDATE`,
                [requestId, driverId]
            );

            if (!requestRows.length ||
                requestRows[0].status !== 'pending' ||
                new Date(requestRows[0].expires_at) <= new Date()) {

                await connection.rollback();

                return {
                    success: false,
                    message: 'Ride request expired or unavailable'
                };
            }

            const rideId = requestRows[0].ride_id;

            const [rides] = await connection.query(
                `SELECT ride_id, status
                FROM rides
                WHERE ride_id = ?
                FOR UPDATE`,
                [rideId]
            );

            if (!rides.length || rides[0].status !== 'pending') {
                await connection.rollback();

                return {
                    success: false,
                    message: 'Ride is no longer available'
                };
            }

            const [drivers] = await connection.query(
                `SELECT id, current_ride_id
                FROM users
                WHERE id = ?
                AND user_type = 3
                AND status = 1
                AND is_online = 1
                FOR UPDATE`,
                [driverId]
            );

            if (!drivers.length || drivers[0].current_ride_id) {
                await connection.rollback();

                return {
                    success: false,
                    message: 'Driver is not available'
                };
            }

            const [assigned] = await connection.query(
                `UPDATE rides
                SET driver_id = ?,
                    status = 'accepted'
                WHERE ride_id = ?
                AND status = 'pending'`,
                [driverId, rideId]
            );

            if (!assigned.affectedRows) {
                await connection.rollback();

                return {
                    success: false,
                    message: 'Ride could not be assigned'
                };
            }

            await connection.query(
                `UPDATE users
                SET current_ride_id = ?
                WHERE id = ?
                AND current_ride_id IS NULL`,
                [rideId, driverId]
            );

            await connection.query(
                `UPDATE ride_requests
                SET status = CASE
                    WHEN id = ? THEN 'accepted'
                    ELSE 'cancelled'
                END,
                responded_at = NOW()
                WHERE ride_id = ?
                AND status IN ('pending', 'queued')`,
                [requestId, rideId]
            );

            await connection.commit();

            return {
                success: true,
                ride_id: rideId
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
    static async getExpiredRideIds() {

        await dbPool.query(
            `UPDATE ride_requests
            SET status = 'expired',
                responded_at = NOW()
            WHERE status = 'pending'
            AND expires_at <= NOW()`
        );

        const [rows] = await dbPool.query(
            `SELECT DISTINCT rr.ride_id
            FROM ride_requests rr
            INNER JOIN rides r ON r.ride_id = rr.ride_id
            WHERE r.status = 'pending'
            AND rr.status = 'queued'
            AND NOT EXISTS (
                SELECT 1
                FROM ride_requests active
                WHERE active.ride_id = rr.ride_id
                AND active.status = 'pending'
                AND active.expires_at > NOW()
            )`
        );

        return rows.map(row => row.ride_id);
    }
    static async cancelRemainingRequests(rideId) {
        await dbPool.query(
            `UPDATE ride_requests
            SET status = 'cancelled',
                responded_at = NOW()
            WHERE ride_id = ?
            AND status IN ('queued', 'pending')`,
            [rideId]
        );
    }
    static async getRideIdFromRequest(requestId, driverId) {
        const [rows] = await dbPool.query(
            `SELECT ride_id
            FROM ride_requests
            WHERE id = ?
            AND driver_id = ?
            LIMIT 1`,
            [requestId, driverId]
        );

        return rows.length ? rows[0].ride_id : null;
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
    static async getNearbyDrivers(h3Cells, vehicleType) {

        if (!h3Cells.length) return [];

        const placeholders = h3Cells.map(() => '?').join(',');

        const sql = `
            SELECT
                u.id AS driver_id,
                u.first_name,
                u.last_name,
                u.fcm_token,
                u.last_location_latitude AS latitude,
                u.last_location_longitude AS longitude,
                u.h3_index,
                u.current_ride_id,
                v.vehicle_type,
                v.vehicle_number

            FROM users u

            INNER JOIN vehicles v
                ON v.user_id = u.id

            WHERE u.user_type = 3
            AND u.status = 1
            AND u.is_online = 1
            AND u.deleted_at IS NULL
            AND u.current_ride_id IS NULL
            AND u.fcm_token IS NOT NULL
            AND u.fcm_token != ''
            AND u.h3_index IN (${placeholders})

            AND v.vehicle_type = ?
            AND v.status = 1
            AND v.deleted_at IS NULL
        `;

        const [rows] = await dbPool.query(
            sql,
            [...h3Cells, vehicleType]
        );

        return rows;
    }

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
                 WHERE id = ? AND user_type = 3 AND status = 1
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
                 SET 
                    is_online = ?,
                    last_location_latitude = ?,
                    last_location_longitude = ?,
                    last_location_at = NOW(),
                    h3_index = ?
                 WHERE id = ?`,
                [1,latitude, longitude, h3Index, driverId]
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