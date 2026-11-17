const dbPool = require('../../shared/database');
const md5 = require('md5')
const moment = require('moment');
//const mysql = require('mysql2');
//const { setCacheData, getCacheData } = require('../../../shared/redis/Redis');

class AdminModel {
    async getUser(connection, email, password) {
        try {
            const sql = 'SELECT u.*FROM admin as u WHERE email = ? AND password = ? ';
            const [result] = await connection.query(sql, [email, md5(password)]);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async getUserWithId(connection, userId) {
        try {
            const sql = `SELECT * FROM admin WHERE  id= '${userId}' `;
            const [result] = await connection.query(sql);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async updateToken(connection, userId, token) {
        try {
            const sql = 'UPDATE admin SET token = ? WHERE  id=?';
            const result = await connection.query(sql, [token, userId]);
            const affectedRows = result[0] ? result[0].affectedRows : 0;
            if (result && affectedRows > 0) {
                return await this.getUserWithId(connection, userId);
            } else {
                throw new Error('User not found or token not updated');
            }
        } catch (error) {
            throw new Error('Failed to update user token');
        }
    }

    // start for drivers
  
    async getDrivers(connection, {limit,offset,status,search,documentStatus}) {

        let where = `
            WHERE u.user_type = 3
            AND u.deleted_at IS NULL
        `;

        const values = [];

        if (status !== undefined && status !== '') {
            where += ` AND u.status = ?`;
            values.push(status);
        }

        if (search) {
            where += `
                AND (
                    u.first_name LIKE ?
                    OR u.last_name LIKE ?
                    OR u.mobile LIKE ?
                    OR u.email LIKE ?
                    OR u.dl_number LIKE ?
                    OR u.aadhar_number LIKE ?
                )
            `;

            const searchValue = `%${search}%`;

            values.push(
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue
            );
        }

        if (documentStatus !== undefined && documentStatus !== '') {
            where += `
                AND (
                    u.aadhar_status = ?
                    OR u.pan_status = ?
                    OR u.dl_status = ?
                    OR COALESCE(v.rc_status, 0) = ?
                )
            `;

            values.push(
                documentStatus,
                documentStatus,
                documentStatus,
                documentStatus
            );
        }

        const sql = `
            SELECT
                u.id,
                u.first_name,
                u.last_name,
                u.mobile,
                u.email,
                u.profile_image,
                u.status,
                u.is_online,
                u.created_at,

                u.aadhar_status,
                u.pan_status,
                u.dl_status,

                v.id AS vehicle_id,
                v.vehicle_type,
                v.vehicle_number,
                v.status AS vehicle_status,
                v.rc_status

            FROM users u

            LEFT JOIN (
                SELECT v1.*
                FROM vehicles v1
                INNER JOIN (
                    SELECT user_id, MAX(id) AS latest_id
                    FROM vehicles
                    WHERE deleted_at IS NULL
                    GROUP BY user_id
                ) latest
                    ON latest.latest_id = v1.id
            ) v ON v.user_id = u.id

            ${where}

            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const [rows] = await connection.execute(sql, [
            ...values,
            Number(limit),
            Number(offset)
        ]);

        return rows;
    }


    async countDrivers(connection, {status,search, documentStatus}) {

        let where = `
            WHERE u.user_type = 3
            AND u.deleted_at IS NULL
        `;

        const values = [];

        if (status !== undefined && status !== '') {
            where += ` AND u.status = ?`;
            values.push(status);
        }

        if (search) {
            where += `
                AND (
                    u.first_name LIKE ?
                    OR u.last_name LIKE ?
                    OR u.mobile LIKE ?
                    OR u.email LIKE ?
                    OR u.dl_number LIKE ?
                    OR u.aadhar_number LIKE ?
                )
            `;

            const searchValue = `%${search}%`;

            values.push(
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue
            );
        }

        if (documentStatus !== undefined && documentStatus !== '') {
            where += `
                AND (
                    u.aadhar_status = ?
                    OR u.pan_status = ?
                    OR u.dl_status = ?
                    OR COALESCE(v.rc_status, 0) = ?
                )
            `;

            values.push(
                documentStatus,
                documentStatus,
                documentStatus,
                documentStatus
            );
        }

        const sql = `
            SELECT COUNT(DISTINCT u.id) AS total

            FROM users u

            LEFT JOIN vehicles v
                ON v.user_id = u.id
                AND v.deleted_at IS NULL

            ${where}
        `;

        const [rows] = await connection.execute(sql, values);

        return Number(rows[0].total || 0);
    }


    async getDriverDetails(connection, driverId) {

        const userSql = `
            SELECT
                id,
                user_type,
                first_name,
                last_name,
                mobile,
                email,
                profile_image,
                dl_number,
                dl_front,
                dl_back,
                dl_status,
                dl_rejection_reason,
                aadhar_number,
                aadhar_front,
                aadhar_back,
                aadhar_status,
                aadhar_rejection_reason,
                pan,
                pan_image,
                pan_status,
                pan_rejection_reason,
                status,
                is_online,
                last_login_at,
                created_at,
                updated_at
            FROM users
            WHERE id = ?
            AND user_type = 3
            AND deleted_at IS NULL
            LIMIT 1
        `;

        const [users] = await connection.execute(
            userSql,
            [driverId]
        );

        return users[0] || null;
    }


    async getDriverVehicle(connection, driverId) {

        const sql = `
            SELECT
                id,
                user_id,
                vehicle_type,
                vehicle_number,
                brand,
                model,
                color,
                fuel_type,
                vehicle_photo,
                rc_front,
                rc_back,
                is_primary,
                status,
                rc_status,
                rejection_reason,
                created_at,
                updated_at
            FROM vehicles
            WHERE user_id = ?
            AND deleted_at IS NULL
            ORDER BY is_primary DESC, id DESC
            LIMIT 1
        `;

        const [rows] = await connection.execute(
            sql,
            [driverId]
        );

        return rows[0] || null;
    }


    async verifyDriverDocument(connection, {
        driverId,
        document,
        action,
        rejectionReason
    }) {

        try {
            await connection.beginTransaction();
            const user = await this.getDriverDetails(
                connection,
                driverId
            );
            if (!user) {
                throw new Error('DRIVER_NOT_FOUND');
            }

            const vehicle = await this.getDriverVehicle(
                connection,
                driverId
            );

            if (document === 'rc' && !vehicle) {
                throw new Error('VEHICLE_NOT_FOUND');
            }

            const status = action === 'approve' ? 1 : 2;
            const reason = action === 'reject'
                ? rejectionReason
                : null;

            const documentMap = {
                aadhar: {
                    table: 'users',
                    statusColumn: 'aadhar_status',
                    reasonColumn: 'aadhar_rejection_reason'
                },
                pan: {
                    table: 'users',
                    statusColumn: 'pan_status',
                    reasonColumn: 'pan_rejection_reason'
                },
                dl: {
                    table: 'users',
                    statusColumn: 'dl_status',
                    reasonColumn: 'dl_rejection_reason'
                },
                rc: {
                    table: 'vehicles',
                    statusColumn: 'rc_status',
                    reasonColumn: 'rejection_reason'
                }
            };

            const config = documentMap[document];

            if (!config) {
                throw new Error('INVALID_DOCUMENT');
            }

            const updateSql = `
                UPDATE ${config.table}
                SET
                    ${config.statusColumn} = ?,
                    ${config.reasonColumn} = ?,
                    updated_at = NOW()
                WHERE ${document === 'rc' ? 'user_id' : 'id'} = ?
                ${document === 'rc' ? 'AND deleted_at IS NULL' : 'AND user_type = 3 AND deleted_at IS NULL'}
            `;

            const [updateResult] = await connection.execute(
                updateSql,
                [
                    status,
                    reason,
                    driverId
                ]
            );

            if (updateResult.affectedRows === 0) {
                // MySQL may return 0 for unchanged values.
                // Verify that the record exists before treating it as an error.
                if (document === 'rc' && !vehicle) {
                    throw new Error('VEHICLE_NOT_FOUND');
                }
            }

            // Fetch latest verification statuses
            const updatedUser = await this.getDriverDetails(
                connection,
                driverId
            );

            const updatedVehicle = await this.getDriverVehicle(
                connection,
                driverId
            );

            // DL and RC are mandatory.
            let allApproved = Boolean(
                updatedUser.dl_number &&
                updatedUser.dl_front &&
                updatedUser.dl_back &&
                Number(updatedUser.dl_status) === 1 &&
                updatedVehicle &&
                updatedVehicle.rc_front &&
                updatedVehicle.rc_back &&
                Number(updatedVehicle.rc_status) === 1
            );

            // Aadhaar is required only if the driver submitted Aadhaar details.
            const aadhaarSubmitted = Boolean(
                updatedUser.aadhar_number ||
                updatedUser.aadhar_front ||
                updatedUser.aadhar_back
            );

            if (aadhaarSubmitted) {
                allApproved = allApproved && Boolean(
                    updatedUser.aadhar_number &&
                    updatedUser.aadhar_front &&
                    updatedUser.aadhar_back &&
                    Number(updatedUser.aadhar_status) === 1
                );
            }

            // PAN is required only if the driver submitted PAN details.
            const panSubmitted = Boolean(
                updatedUser.pan || updatedUser.pan_image
            );

            if (panSubmitted) {
                allApproved = allApproved && Boolean(
                    updatedUser.pan &&
                    updatedUser.pan_image &&
                    Number(updatedUser.pan_status) === 1
                );
            }

            // Driver status: 1 Active, 2 Pending.
            await connection.execute(
                `
                    UPDATE users
                    SET status = ?, updated_at = NOW()
                    WHERE id = ?
                    AND user_type = 3
                    AND deleted_at IS NULL
                `,
                [
                    allApproved ? 1 : 2,
                    driverId
                ]
            );

            // Vehicle status follows RC verification.
            if (updatedVehicle) {
                const vehicleStatus =
                    Number(updatedVehicle.rc_status) === 1 ? 1 :
                    Number(updatedVehicle.rc_status) === 2 ? 2 : 0;

                await connection.execute(
                    `
                        UPDATE vehicles
                        SET status = ?, updated_at = NOW()
                        WHERE user_id = ?
                        AND deleted_at IS NULL
                    `,
                    [
                        vehicleStatus,
                        driverId
                    ]
                );
            }

            await connection.commit();

            return {
                driver_status: allApproved ? 1 : 2,
                document_status: status
            };

        } catch (error) {

            await connection.rollback();
            throw error;

        } finally {
            connection.release();
        }
    } 
    // end for drivers 
    // Primary vehicle listing
    async getVehicles(connection, {limit,offset,  status, rcStatus, search, vehicleType }) 
    {
        let where = `
            WHERE v.deleted_at IS NULL
            AND v.is_primary = 1
            AND u.user_type = 3
            AND u.deleted_at IS NULL
        `;

        const values = [];

        if (status !== undefined && status !== '') {
            where += ` AND v.status = ?`;
            values.push(status);
        }

        if (rcStatus !== undefined && rcStatus !== '') {
            where += ` AND v.rc_status = ?`;
            values.push(rcStatus);
        }

        if (vehicleType) {
            where += ` AND v.vehicle_type = ?`;
            values.push(vehicleType);
        }

        if (search) {
            where += `
                AND (
                    u.first_name LIKE ?
                    OR u.last_name LIKE ?
                    OR u.mobile LIKE ?
                    OR u.email LIKE ?
                    OR v.vehicle_number LIKE ?
                    OR v.brand LIKE ?
                    OR v.model LIKE ?
                )
            `;

            const searchValue = `%${search}%`;

            values.push(
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue
            );
        }

        const sql = `
            SELECT
                v.id,
                v.user_id,
                v.vehicle_type,
                v.vehicle_number,
                v.brand,
                v.model,
                v.color,
                v.fuel_type,
                v.vehicle_photo,
                v.rc_front,
                v.rc_back,
                v.is_primary,
                v.status,
                v.rc_status,
                v.rejection_reason,
                v.created_at,
                v.updated_at,

                u.first_name,
                u.last_name,
                u.mobile,
                u.email,
                u.profile_image,
                u.status AS driver_status,
                u.is_online

            FROM vehicles v

            INNER JOIN users u
                ON u.id = v.user_id

            ${where}

            ORDER BY v.created_at DESC

            LIMIT ? OFFSET ?
        `;

        const [rows] = await dbPool.execute(sql, [
            ...values,
            Number(limit),
            Number(offset)
        ]);

        return rows;
    }

    // Count primary vehicles
    async countVehicles(connection, {status, rcStatus, search, vehicleType }) {
        let where = `
            WHERE v.deleted_at IS NULL
            AND v.is_primary = 1
            AND u.user_type = 3
            AND u.deleted_at IS NULL
        `;

        const values = [];

        if (status !== undefined && status !== '') {
            where += ` AND v.status = ?`;
            values.push(status);
        }

        if (rcStatus !== undefined && rcStatus !== '') {
            where += ` AND v.rc_status = ?`;
            values.push(rcStatus);
        }

        if (vehicleType) {
            where += ` AND v.vehicle_type = ?`;
            values.push(vehicleType);
        }

        if (search) {
            where += `
                AND (
                    u.first_name LIKE ?
                    OR u.last_name LIKE ?
                    OR u.mobile LIKE ?
                    OR u.email LIKE ?
                    OR v.vehicle_number LIKE ?
                    OR v.brand LIKE ?
                    OR v.model LIKE ?
                )
            `;

            const searchValue = `%${search}%`;

            values.push(
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue,
                searchValue
            );
        }

        const sql = `
            SELECT COUNT(*) AS total
            FROM vehicles v
            INNER JOIN users u
                ON u.id = v.user_id
            ${where}
        `;

        const [rows] = await connection.execute(sql, values);

        return Number(rows[0].total || 0);
    }

    // Primary vehicle detail
    async getVehicleDetails(connection, vehicleId) {
        const sql = `
            SELECT
                v.id,
                v.user_id,
                v.vehicle_type,
                v.vehicle_number,
                v.brand,
                v.model,
                v.color,
                v.fuel_type,
                v.vehicle_photo,
                v.rc_front,
                v.rc_back,
                v.is_primary,
                v.status,
                v.rc_status,
                v.rejection_reason,
                v.created_at,
                v.updated_at,

                u.first_name,
                u.last_name,
                u.mobile,
                u.email,
                u.profile_image,
                u.status AS driver_status,
                u.is_online

            FROM vehicles v

            INNER JOIN users u
                ON u.id = v.user_id

            WHERE v.id = ?
            AND v.is_primary = 1
            AND v.deleted_at IS NULL
            AND u.user_type = 3
            AND u.deleted_at IS NULL

            LIMIT 1
        `;

        const [rows] = await connection.execute(sql, [vehicleId]);

        return rows[0] || null;
    }

    // Get vehicle-wise fare settings
    async getFareSettings(connection, vehicleType) {

        const fields = [
            'base_fare',
            'base_fare_max_km',
            'per_km_charge',
            'night_fare_percentage'
        ];

        const keys = fields.map(field => `${vehicleType}_${field}`);

        const placeholders = keys.map(() => '?').join(',');

        const sql = `
            SELECT
                setting_key,
                setting_value
            FROM settings
            WHERE setting_key IN (${placeholders})
            AND status = 1
        `;

        const [rows] = await connection.execute(sql, keys);

        const result = {};

        fields.forEach(field => {
            result[field] = '';
        });

        rows.forEach(row => {
            const field = row.setting_key.replace(`${vehicleType}_`, '');
            if (fields.includes(field)) {
                result[field] = row.setting_value;
            }
        });

        return result;
    }


    // Update vehicle-wise fare settings
    async updateFareSettings(connection,vehicleType, fares) {

        //const connection = await dbPool.getConnection();
        const descriptions = {
            base_fare: 'Vehicle base fare amount',
            base_fare_max_km: 'Vehicle base fare maximum distance',
            per_km_charge: 'Vehicle per kilometer charge',
            night_fare_percentage: 'Vehicle night fare percentage'
        };
        try {
            await connection.beginTransaction();
            for (const [field, value] of Object.entries(fares)) {
                const settingKey = `${vehicleType}_${field}`;
                const [existing] = await connection.execute(
                    `
                        SELECT id
                        FROM settings
                        WHERE setting_key = ?
                        LIMIT 1
                    `,
                    [settingKey]
                );
                if (existing.length > 0) {
                    await connection.execute(
                        `
                            UPDATE settings
                            SET
                                setting_value = ?,
                                setting_type = 'number',
                                status = 1,
                                updated_at = NOW()
                            WHERE setting_key = ?
                        `,
                        [String(value), settingKey]
                    );

                } else {
                    await connection.execute(
                        `
                            INSERT INTO settings
                            (
                                setting_key,
                                setting_value,
                                setting_type,
                                description,
                                status,
                                created_at,
                                updated_at
                            )
                            VALUES (?, ?, 'number', ?, 1, NOW(), NOW())
                        `,
                        [
                            settingKey,
                            String(value),
                            descriptions[field]
                        ]
                    );

                }
            }
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

module.exports = new AdminModel();