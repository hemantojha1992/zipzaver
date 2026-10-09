const dbPool = require('../../database/db');
const moment = require('moment');
const mysql = require('mysql2');
const { setCacheData, getCacheData } = require('../../../shared/redis/Redis');


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




}

module.exports = rideModel;