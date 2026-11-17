const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const AuthModel = require('../models/auth.models');

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const dbPool = require('../../database/db');

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRATION || 5);
const MAX_OTP_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

class AuthService {

    async logout(connection,userId) {
        try {
            
            await AuthModel.updateToken(connection,userId, null);
            return {
                status: 1,
                message: 'Logout successful',
            };

        } catch (error) {
            return {
                status: 0,
                message: 'Logout failed',
                details: error.message,
            };
        }
    }


    /**
     * Generate random 6 digit OTP
     */
    generateOtp() {
        return crypto.randomInt(100000, 1000000).toString();
    }


    /**
     * Hash OTP before storing
     */
    hashOtp(otp) {
        return crypto.createHash('sha256').update(otp).digest('hex');
    }


    /**
     * Send OTP
     */
    async sendOtp(connection,mobile, userType) {
        try {
            if (!mobile) {
                return {
                    status: 0,
                    message: 'Mobile number is required'
                };
            }

            mobile = mobile.toString().trim();

            if (!/^[6-9]\d{9}$/.test(mobile)) {
                return {
                    status: 0,
                    message: 'Please enter a valid mobile number'
                };
            }

            if (
                userType === undefined ||
                userType === null ||
                userType === ''
            ) {
                return {
                    status: 0,
                    message: 'User type is required'
                };
            }

            userType = parseInt(userType, 10);

            if (isNaN(userType)) {
                return {
                    status: 0,
                    message: 'Invalid user type'
                };
            }

            let users = await AuthModel.getUserByMobile(connection,mobile);
            let user;

            if (!Array.isArray(users) || users.length === 0) {

                const userResult = await AuthModel.createUser({
                    user_type: userType,
                    mobile: mobile,
                    status: Number(userType) === 3 ? 2 : 1,
                    is_online: 0,
                });

                if (!userResult || !userResult.insertId) {
                    return {
                        status: 0,
                        message: 'Unable to create user'
                    };
                }
                const newUsers = await AuthModel.getUserById(userResult.insertId,connection);

                if (!Array.isArray(newUsers) || newUsers.length === 0) {
                    return {
                        status: 0,
                        message: 'Unable to create user'
                    };
                }

                user = newUsers[0];

            } else {
                user = users[0];
            }

            const otp = this.generateOtp();
            const otpHash = this.hashOtp(otp);

            const expiresAt = new Date(
                Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
            );

            await AuthModel.expirePreviousOtps(connection,mobile, 'LOGIN');

            await AuthModel.createOtp(connection,{
                user_id: user.id,
                mobile: mobile,
                otp_type: 'LOGIN',
                otp_hash: otpHash,
                attempts: 0,
                max_attempts: MAX_OTP_ATTEMPTS,
                expires_at: expiresAt
            });

            /*
            await SmsService.sendOtp(mobile, otp);
            */

            return {
                status: 1,
                message: 'OTP sent successfully',
                otp: otp, // Production mein remove karein
                user_type: userType
            };

        } catch (error) {
            console.error('sendOtp error:', error);

            return {
                status: 0,
                message: 'Unable to send OTP',
                details: error.message || 'Unknown error'
            };
        }
    }


    /**
     * Verify OTP and Login
     */
    async verifyOtp(connection,mobile, otp, device = {}) {
        try {
            if (!mobile || !otp) {
                return {
                    status: 0,
                    message: 'Mobile number and OTP are required'
                };
            }

            mobile = mobile.toString().trim();
            otp = otp.toString().trim();

            if (!/^[6-9]\d{9}$/.test(mobile)) {
                return {
                    status: 0,
                    message: 'Please enter a valid mobile number'
                };
            }

            if (!/^\d{6}$/.test(otp)) {
                return {
                    status: 0,
                    message: 'OTP must be 6 digits'
                };
            }

            const users = await AuthModel.getUserByMobile(connection,mobile);

            if (!Array.isArray(users) || users.length === 0) {
                return {
                    status: 0,
                    message: 'User not found'
                };
            }

            const user = users[0];

            const otpRecord = await AuthModel.getLatestPendingOtp(connection,mobile,'LOGIN');

            if (!otpRecord) {
                return {
                    status: 0,
                    message: 'OTP expired or not found'
                };
            }

            if (new Date(otpRecord.expires_at) < new Date()) {
                await AuthModel.markOtpExpired(connection,otpRecord.id);

                return {
                    status: 0,
                    message: 'OTP has expired'
                };
            }

            if (otpRecord.attempts >= otpRecord.max_attempts) {
                
                await AuthModel.markOtpBlocked(connection,otpRecord.id);

                return {
                    status: 0,
                    message: 'Maximum OTP attempts exceeded'
                };
            }

            const otpHash = this.hashOtp(otp);

            if (otpHash !== otpRecord.otp_hash) {
                await AuthModel.incrementOtpAttempt(connection,otpRecord.id);

                const remainingAttempts =
                    otpRecord.max_attempts - (otpRecord.attempts + 1);

                if (remainingAttempts <= 0) {
                    await AuthModel.markOtpBlocked(connection,otpRecord.id);

                    return {
                        status: 0,
                        message: 'Maximum OTP attempts exceeded'
                    };
                }

                return {
                    status: 0,
                    message: 'Invalid OTP',
                    remaining_attempts: remainingAttempts
                };
            }
            await AuthModel.markOtpVerified(connection,otpRecord.id);

            await AuthModel.updateLastLogin(connection,user.id);

            if (device.device_id && device.device_type) {
                await AuthModel.saveUserDevice(connection,user.id, {
                    device_id: device.device_id.toString().trim(),
                    device_type: device.device_type
                        .toString()
                        .trim()
                        .toLowerCase(),
                    fcm_token: device.fcm_token
                        ? device.fcm_token.toString().trim()
                        : null
                });
            }

            let privileges = user.privileges;
            let privilegesArray = [];

            if (privileges && privileges.length > 0) {
                privilegesArray = Array.isArray(privileges)
                    ? privileges
                    : privileges.split(',').map(p => p.trim());
            }

            const tokenPayload = {
                user_id: user.id,
                user_type: user.user_type,
                privileges: privilegesArray
            };

            const token = jwt.sign(
                tokenPayload,
                process.env.JWT_SECRET,
                {
                    expiresIn: process.env.JWT_EXPIRATION,
                    algorithm: process.env.JWT_ALGORITHM
                }
            );

            delete user.password_hash;

            return {
                status: 1,
                message: 'Login successful',
                token,
                data: {
                    ...user,
                    privileges: privilegesArray
                }
            };

        } catch (error) {
            console.error('verifyOtp error:', error);

            return {
                status: 0,
                message: 'Login failed',
                details: error.message
            };
        }
    }


    /**
     * Resend OTP
     */
    async resendOtp(connection, mobile) {
        return await this.sendOtp(connection, mobile);
    }
        /**
     * Update Driver Profile - Backup old implementation
     * Kept here to preserve the original service method.
     */
    async updateProfile_bkp(userId, userType, data, files = {}) {
        try {
            if (!userId) {
                return {
                    status: 0,
                    httpStatus: 401,
                    message: 'Unauthorized. Please login again.'
                };
            }

            if (Number(userType) !== 3) {
                return {
                    status: 0,
                    httpStatus: 403,
                    message: 'Only drivers can update this profile.'
                };
            }

            if (!data.dl_number || !String(data.dl_number).trim()) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: 'Driving licence number is required.'
                };
            }

            const requiredFiles = [
                ['dlFront', 'DL front image'],
                ['dlBack', 'DL back image'],
                ['rcFront', 'RC front image'],
                ['rcBack', 'RC back image']
            ];

            for (const [key, label] of requiredFiles) {
                if (!files[key]) {
                    return {
                        status: 0,
                        httpStatus: 400,
                        message: `${label} is required.`
                    };
                }
            }

            const userResult = await AuthModel.getUserById(userId);
            const user = Array.isArray(userResult)
                ? userResult[0]
                : userResult;

            if (!user || Number(user.user_type) !== 3) {
                return {
                    status: 0,
                    httpStatus: 404,
                    message: 'Driver not found.'
                };
            }

            if (Number(user.status) !== 1) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: 'Your account is inactive or blocked.'
                };
            }

            if (
                data.email !== undefined &&
                data.email !== null &&
                String(data.email).trim() !== ''
            ) {
                const emailResult = await AuthModel.getUserByEmail(
                    String(data.email).trim().toLowerCase()
                );

                const emailUser = Array.isArray(emailResult)
                    ? emailResult[0]
                    : emailResult;

                if (emailUser && String(emailUser.id) !== String(userId)) {
                    return {
                        status: 0,
                        httpStatus: 400,
                        message: 'Email is already registered.'
                    };
                }
            }

            const userData = {};

            const userFieldMap = {
                first_name: 'first_name',
                last_name: 'last_name',
                email: 'email',
                aadhaar_number: 'aadhar_number',
                dl_number: 'dl_number',
                pan: 'pan'
            };

            for (const [requestKey, dbColumn] of Object.entries(userFieldMap)) {
                if (Object.prototype.hasOwnProperty.call(data, requestKey)) {
                    userData[dbColumn] =
                        requestKey === 'email' && !data[requestKey]
                            ? null
                            : data[requestKey];
                }
            }

            const getFilePath = (file) => {
                if (!file) return undefined;
                return file.filename || file.path;
            };

            const userFileMap = {
                profileImage: 'profile_image',
                aadhaarFront: 'aadhar_front',
                aadhaarBack: 'aadhar_back',
                dlFront: 'dl_front',
                dlBack: 'dl_back',
                panImage: 'pan_image'
            };

            for (const [fileKey, dbColumn] of Object.entries(userFileMap)) {
                const filePath = getFilePath(files[fileKey]);

                if (filePath !== undefined) {
                    userData[dbColumn] = filePath;
                }
            }

            if (Object.keys(userData).length > 0) {
                await AuthModel.updateUser(userId, userData);
            }

            const vehicleData = {};

            const vehicleFieldMap = {
                vehicle_type: 'vehicle_type',
                vehicle_number: 'vehicle_number',
                brand: 'brand',
                model: 'model',
                color: 'color',
                fuel_type: 'fuel_type'
            };

            for (const [requestKey, dbColumn] of Object.entries(vehicleFieldMap)) {
                if (Object.prototype.hasOwnProperty.call(data, requestKey)) {
                    vehicleData[dbColumn] = data[requestKey];
                }
            }

            const vehicleFileMap = {
                vehiclePhoto: 'vehicle_photo',
                rcFront: 'rc_front',
                rcBack: 'rc_back'
            };

            for (const [fileKey, dbColumn] of Object.entries(vehicleFileMap)) {
                const filePath = getFilePath(files[fileKey]);

                if (filePath !== undefined) {
                    vehicleData[dbColumn] = filePath;
                }
            }

            vehicleData.status = 0;
            vehicleData.rejection_reason = null;

            const existingVehicle = await AuthModel.getVehicleByUserId(userId);

            if (existingVehicle) {
                await AuthModel.updateVehicle(userId, vehicleData);
            } else {
                await AuthModel.createVehicle({
                    user_id: userId,
                    vehicle_type: vehicleData.vehicle_type ?? null,
                    vehicle_number: vehicleData.vehicle_number ?? null,
                    brand: vehicleData.brand ?? null,
                    model: vehicleData.model ?? null,
                    color: vehicleData.color ?? null,
                    fuel_type: vehicleData.fuel_type ?? null,
                    vehicle_photo: vehicleData.vehicle_photo ?? null,
                    rc_front: vehicleData.rc_front,
                    rc_back: vehicleData.rc_back,
                    is_primary: 1,
                    status: 0,
                    rejection_reason: null
                });
            }

            const updatedUserResult = await AuthModel.getUserById(userId);
            const updatedUser = Array.isArray(updatedUserResult)
                ? updatedUserResult[0]
                : updatedUserResult;

            const updatedVehicle = await AuthModel.getVehicleByUserId(userId);

            if (updatedUser) {
                delete updatedUser.password;
                delete updatedUser.deleted_at;
            }

            return {
                status: 1,
                httpStatus: 200,
                message: 'Driver profile updated successfully. DL and RC verification is pending.',
                data: {
                    user: updatedUser,
                    vehicle: updatedVehicle
                }
            };

        } catch (error) {
            console.error('AuthService.updateProfile_bkp error:', error);
            throw error;
        }
    }
        /**
     * Update Driver Profile
     *
     * Supports:
     * 1. Multer memoryStorage (file.buffer)
     * 2. Multer diskStorage (file.path inside uploads/.temp)
     *
     * DB transaction + file cleanup on failure.
     */
    async updateProfile_bkp(userId, userType, data, files = {}) {

        let connection = null;
        let transactionStarted = false;
        let transactionCommitted = false;

        //const uploadRoot = path.resolve(__dirname, '../../uploads');
        const uploadRoot = path.resolve(__dirname, '../../../uploads');
        const tempRoot = path.join(uploadRoot, '.temp');

        const requestTempDir = path.join(
            tempRoot,
            `driver-profile-${Date.now()}-${crypto.randomUUID()}`
        );

        const stagedFiles = [];
        const originalTempFiles = [];
        const permanentFiles = [];

        const fileMap = {
            profileImage: {
                column: 'profile_image',
                directory: 'driver_doc/profile_image'
            },
            aadhaarFront: {
                column: 'aadhar_front',
                directory: 'driver_doc/aadhar'
            },
            aadhaarBack: {
                column: 'aadhar_back',
                directory: 'driver_doc/aadhar'
            },
            dlFront: {
                column: 'dl_front',
                directory: 'driver_doc/dl'
            },
            dlBack: {
                column: 'dl_back',
                directory: 'driver_doc/dl'
            },
            panImage: {
                column: 'pan_image',
                directory: 'driver_doc/pan'
            },
            vehiclePhoto: {
                column: 'vehicle_photo',
                directory: 'vehicles/vehicle_photo'
            },
            rcFront: {
                column: 'rc_front',
                directory: 'vehicles/rc'
            },
            rcBack: {
                column: 'rc_back',
                directory: 'vehicles/rc'
            }
        };


        /**
         * Safely remove a file.
         */
        const safeRemove = async (filePath) => {
            if (!filePath) return;

            try {
                await fs.promises.unlink(filePath);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(
                        'Upload cleanup error:',
                        error.message
                    );
                }
            }
        };


        /**
         * Get safe file extension.
         */
        const getSafeExtension = (file) => {
            const extension = path.extname(
                file.originalname || ''
            ).toLowerCase();

            const allowedExtensions = [
                '.jpg',
                '.jpeg',
                '.png',
                '.webp',
                '.pdf'
            ];

            if (allowedExtensions.includes(extension)) {
                return extension;
            }

            const mimeExtensions = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/webp': '.webp',
                'application/pdf': '.pdf'
            };

            return mimeExtensions[file.mimetype] || '.jpg';
        };


        /**
         * Move incoming file into request temporary directory.
         */
        const stageIncomingFile = async (file, key) => {
            if (!file) return null;

            await fs.promises.mkdir(
                requestTempDir,
                { recursive: true }
            );

            const extension = getSafeExtension(file);

            const stagedPath = path.join(
                requestTempDir,
                `${key}-${crypto.randomUUID()}${extension}`
            );

            // Memory storage support
            if (file.buffer && Buffer.isBuffer(file.buffer)) {

                await fs.promises.writeFile(
                    stagedPath,
                    file.buffer,
                    { flag: 'wx' }
                );

            } else if (file.path) {

                // Disk storage support
                const incomingPath = path.resolve(file.path);

                const resolvedTempRoot =
                    path.resolve(tempRoot) + path.sep;

                // Only allow incoming files from uploads/.temp
                if (!incomingPath.startsWith(resolvedTempRoot)) {
                    throw new Error(
                        'Upload middleware must store incoming files in uploads/.temp or use memoryStorage.'
                    );
                }

                originalTempFiles.push(incomingPath);

                await fs.promises.rename(
                    incomingPath,
                    stagedPath
                );

            } else {
                throw new Error(
                    `Invalid uploaded file for field: ${key}`
                );
            }

            stagedFiles.push(stagedPath);

            return stagedPath;
        };


        try {

            // -----------------------------------
            // 1. Basic validation
            // -----------------------------------

            if (!userId) {
                return {
                    status: 0,
                    httpStatus: 401,
                    message: 'Unauthorized. Please login again.'
                };
            }

            if (Number(userType) !== 3) {
                return {
                    status: 0,
                    httpStatus: 403,
                    message: 'Only drivers can update this profile.'
                };
            }

            data = data || {};
            files = files || {};

            if (
                !data.dl_number ||
                !String(data.dl_number).trim()
            ) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: 'Driving licence number is required.'
                };
            }


            // -----------------------------------
            // 2. Required documents validation
            // -----------------------------------

            const requiredFiles = [
                ['dlFront', 'DL front image'],
                ['dlBack', 'DL back image'],
                ['rcFront', 'RC front image'],
                ['rcBack', 'RC back image']
            ];

            for (const [key, label] of requiredFiles) {

                if (!files[key]) {
                    return {
                        status: 0,
                        httpStatus: 400,
                        message: `${label} is required.`
                    };
                }
            }


            // -----------------------------------
            // 3. File MIME type validation
            // -----------------------------------

            const allowedMimeTypes = [
                'image/jpeg',
                'image/png',
                'image/webp',
                'application/pdf'
            ];

            for (const [key, file] of Object.entries(files)) {

                if (!file) continue;

                if (!allowedMimeTypes.includes(file.mimetype)) {
                    return {
                        status: 0,
                        httpStatus: 400,
                        message: `Invalid file type for ${key}. Only JPG, PNG, WEBP and PDF files are allowed.`
                    };
                }
            }


            // -----------------------------------
            // 4. Start DB transaction
            // -----------------------------------

            connection = await dbPool.getConnection();

            await connection.beginTransaction();

            transactionStarted = true;


            // -----------------------------------
            // 5. Fetch driver
            // -----------------------------------

            const userResult = await AuthModel.getUserById(
                userId,
                connection
            );

            const user = Array.isArray(userResult)
                ? userResult[0]
                : userResult;

            if (!user || Number(user.user_type) !== 3) {
                return {
                    status: 0,
                    httpStatus: 404,
                    message: 'Driver not found.'
                };
            }

            if (
                Number(user.status) !== 1 &&
                Number(user.status) !== 2
            ) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: 'Your account is inactive or blocked.'
                };
            }


            // -----------------------------------
            // 6. Duplicate email validation
            // -----------------------------------

            if (
                data.email !== undefined &&
                data.email !== null &&
                String(data.email).trim() !== ''
            ) {

                const email = String(data.email)
                    .trim()
                    .toLowerCase();

                const emailResult = await AuthModel.getUserByEmail(
                    email,
                    connection
                );

                const emailUser = Array.isArray(emailResult)
                    ? emailResult[0]
                    : emailResult;

                if (
                    emailUser &&
                    String(emailUser.id) !== String(userId)
                ) {
                    return {
                        status: 0,
                        httpStatus: 400,
                        message: 'Email is already registered.'
                    };
                }
            }


            // -----------------------------------
            // 7. Stage and move uploaded files
            // -----------------------------------

            const uploadedPaths = {};

            for (const [fileKey, config] of Object.entries(fileMap)) {

                const file = files[fileKey];

                if (!file) continue;

                const stagedPath = await stageIncomingFile(
                    file,
                    fileKey
                );

                const finalDirectory = path.join(
                    uploadRoot,
                    config.directory
                );

                await fs.promises.mkdir(
                    finalDirectory,
                    { recursive: true }
                );

                const fileName =
                    `${Date.now()}-${crypto.randomUUID()}${getSafeExtension(file)}`;

                const finalAbsolutePath = path.join(
                    finalDirectory,
                    fileName
                );

                // .temp and final upload folders must be on same filesystem
                await fs.promises.rename(
                    stagedPath,
                    finalAbsolutePath
                );

                permanentFiles.push(finalAbsolutePath);

                // uploadedPaths[fileKey] = path.posix.join(
                //     'uploads',
                //     config.directory.split(path.sep).join('/'),
                //     fileName
                // );
                uploadedPaths[fileKey] = fileName;
            }
                        // -----------------------------------
            // 8. Prepare user data
            // -----------------------------------

            const userData = {};

            const userFieldMap = {
                first_name: 'first_name',
                last_name: 'last_name',
                email: 'email',
                aadhaar_number: 'aadhar_number',
                dl_number: 'dl_number',
                pan: 'pan'
            };

            for (const [requestKey, dbColumn] of Object.entries(userFieldMap)) {

                if (
                    Object.prototype.hasOwnProperty.call(
                        data,
                        requestKey
                    )
                ) {
                    userData[dbColumn] =
                        requestKey === 'email' && !data[requestKey]
                            ? null
                            : data[requestKey];
                }
            }


            // -----------------------------------
            // 9. User document paths
            // -----------------------------------

            const userFileKeys = [
                'profileImage',
                'aadhaarFront',
                'aadhaarBack',
                'dlFront',
                'dlBack',
                'panImage'
            ];

            for (const fileKey of userFileKeys) {

                if (uploadedPaths[fileKey]) {
                    userData[fileMap[fileKey].column] =
                        uploadedPaths[fileKey];
                }
            }


            // -----------------------------------
            // 10. Update users table
            // -----------------------------------

            if (Object.keys(userData).length > 0) {

                await AuthModel.updateUser(
                    userId,
                    userData,
                    connection
                );
            }


            // -----------------------------------
            // 11. Prepare vehicle data
            // -----------------------------------

            const vehicleData = {};

            const vehicleFieldMap = {
                vehicle_type: 'vehicle_type',
                vehicle_number: 'vehicle_number',
                brand: 'brand',
                model: 'model',
                color: 'color',
                fuel_type: 'fuel_type'
            };

            for (const [requestKey, dbColumn] of Object.entries(vehicleFieldMap)) {

                if (
                    Object.prototype.hasOwnProperty.call(
                        data,
                        requestKey
                    )
                ) {
                    vehicleData[dbColumn] = data[requestKey];
                }
            }


            // -----------------------------------
            // 12. Vehicle document paths
            // -----------------------------------

            const vehicleFileKeys = [
                'vehiclePhoto',
                'rcFront',
                'rcBack'
            ];

            for (const fileKey of vehicleFileKeys) {

                if (uploadedPaths[fileKey]) {
                    vehicleData[fileMap[fileKey].column] =
                        uploadedPaths[fileKey];
                }
            }


            // Documents resubmitted - verification pending
            vehicleData.status = 0;
            vehicleData.rejection_reason = null;


            // -----------------------------------
            // 13. Check existing vehicle
            // -----------------------------------

            const existingVehicle = await AuthModel.getVehicleByUserId(
                userId,
                connection
            );


            // -----------------------------------
            // 14. Insert or update vehicles table
            // -----------------------------------

            if (existingVehicle) {

                await AuthModel.updateVehicle(
                    userId,
                    vehicleData,
                    connection
                );

            } else {

                await AuthModel.createVehicle(
                    {
                        user_id: userId,
                        vehicle_type: vehicleData.vehicle_type ?? null,
                        vehicle_number: vehicleData.vehicle_number ?? null,
                        brand: vehicleData.brand ?? null,
                        model: vehicleData.model ?? null,
                        color: vehicleData.color ?? null,
                        fuel_type: vehicleData.fuel_type ?? null,
                        vehicle_photo: vehicleData.vehicle_photo ?? null,
                        rc_front: vehicleData.rc_front ?? null,
                        rc_back: vehicleData.rc_back ?? null,
                        is_primary: 1,
                        status: 0,
                        rejection_reason: null
                    },
                    connection
                );
            }


            // -----------------------------------
            // 15. Fetch updated profile
            // -----------------------------------

            const updatedUserResult = await AuthModel.getUserById(
                userId,
                connection
            );

            const updatedUser = Array.isArray(updatedUserResult)
                ? updatedUserResult[0]
                : updatedUserResult;

            const updatedVehicle = await AuthModel.getVehicleByUserId(
                userId,
                connection
            );

            if (updatedUser) {
                delete updatedUser.password;
                delete updatedUser.password_hash;
                delete updatedUser.deleted_at;
            }


            // -----------------------------------
            // 16. Commit transaction
            // -----------------------------------

            await connection.commit();

            transactionCommitted = true;

            return {
                status: 1,
                httpStatus: 200,
                message: 'Driver profile updated successfully. DL and RC verification is pending.',
                data: {
                    user: updatedUser,
                    vehicle: updatedVehicle
                }
            };


        } catch (error) {

            // -----------------------------------
            // 17. Rollback transaction
            // -----------------------------------

            if (
                connection &&
                transactionStarted &&
                !transactionCommitted
            ) {
                try {
                    await connection.rollback();
                    transactionStarted = false;

                } catch (rollbackError) {
                    console.error(
                        'Update profile rollback error:',
                        rollbackError
                    );
                }
            }

            console.error(
                'AuthService.updateProfile error:',
                error
            );


            // -----------------------------------
            // 18. Delete newly created permanent files
            // -----------------------------------

            for (const filePath of permanentFiles) {
                await safeRemove(filePath);
            }

            throw error;


        } finally {

            // -----------------------------------
            // 19. Delete incoming Multer temp files
            // -----------------------------------

            for (const file of Object.values(files || {})) {

                if (!file || !file.path) continue;

                const incomingPath = path.resolve(file.path);

                const resolvedTempRoot =
                    path.resolve(tempRoot) + path.sep;

                if (incomingPath.startsWith(resolvedTempRoot)) {
                    await safeRemove(incomingPath);
                }
            }


            // -----------------------------------
            // 20. Rollback if an early return occurred
            // -----------------------------------

            if (
                connection &&
                transactionStarted &&
                !transactionCommitted
            ) {
                try {
                    await connection.rollback();
                    transactionStarted = false;

                } catch (rollbackError) {
                    console.error(
                        'Update profile rollback error:',
                        rollbackError
                    );
                }
            }


            // -----------------------------------
            // 21. Remove temporary files
            // -----------------------------------

            for (const filePath of stagedFiles) {
                await safeRemove(filePath);
            }

            for (const filePath of originalTempFiles) {
                await safeRemove(filePath);
            }


            // -----------------------------------
            // 22. Release DB connection
            // -----------------------------------

            if (connection) {
                connection.release();
            }


            // -----------------------------------
            // 23. Remove request temporary directory
            // -----------------------------------

            try {
                await fs.promises.rm(
                    requestTempDir,
                    {
                        recursive: true,
                        force: true
                    }
                );

            } catch (cleanupError) {
                console.error(
                    'Temporary upload directory cleanup error:',
                    cleanupError
                );
            }
        }
    }
    async updateProfile(connection, userId, userType, data, files = {}) {

        let transactionStarted = false;
        let transactionCommitted = false;

        const uploadRoot = path.resolve(__dirname, '../../../uploads');
        const tempRoot = path.join(uploadRoot, '.temp');

        const requestTempDir = path.join(
            tempRoot,
            `driver-profile-${Date.now()}-${crypto.randomUUID()}`
        );

        const stagedFiles = [];
        const originalTempFiles = [];
        const permanentFiles = [];

        const fileMap = {
            profileImage: {
                column: 'profile_image',
                directory: 'driver_doc/profile_image'
            },
            aadhaarFront: {
                column: 'aadhar_front',
                directory: 'driver_doc/aadhar'
            },
            aadhaarBack: {
                column: 'aadhar_back',
                directory: 'driver_doc/aadhar'
            },
            dlFront: {
                column: 'dl_front',
                directory: 'driver_doc/dl'
            },
            dlBack: {
                column: 'dl_back',
                directory: 'driver_doc/dl'
            },
            panImage: {
                column: 'pan_image',
                directory: 'driver_doc/pan'
            },
            vehiclePhoto: {
                column: 'vehicle_photo',
                directory: 'vehicles/vehicle_photo'
            },
            rcFront: {
                column: 'rc_front',
                directory: 'vehicles/rc'
            },
            rcBack: {
                column: 'rc_back',
                directory: 'vehicles/rc'
            }
        };

        const safeRemove = async (filePath) => {
            if (!filePath) return;

            try {
                await fs.promises.unlink(filePath);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Upload cleanup error:', error.message);
                }
            }
        };

        const getSafeExtension = (file) => {
            const extension = path.extname(
                file.originalname || ''
            ).toLowerCase();

            const allowedExtensions = [
                '.jpg',
                '.jpeg',
                '.png',
                '.webp',
                '.pdf'
            ];

            if (allowedExtensions.includes(extension)) {
                return extension;
            }

            const mimeExtensions = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/webp': '.webp',
                'application/pdf': '.pdf'
            };

            return mimeExtensions[file.mimetype] || '.jpg';
        };

        const stageIncomingFile = async (file, key) => {
            if (!file) return null;

            await fs.promises.mkdir(
                requestTempDir,
                { recursive: true }
            );

            const extension = getSafeExtension(file);

            const stagedPath = path.join(
                requestTempDir,
                `${key}-${crypto.randomUUID()}${extension}`
            );

            if (file.buffer && Buffer.isBuffer(file.buffer)) {

                await fs.promises.writeFile(
                    stagedPath,
                    file.buffer,
                    { flag: 'wx' }
                );

            } else if (file.path) {

                const incomingPath = path.resolve(file.path);

                const resolvedTempRoot =
                    path.resolve(tempRoot) + path.sep;

                if (!incomingPath.startsWith(resolvedTempRoot)) {
                    throw new Error(
                        'Upload middleware must store incoming files in uploads/.temp or use memoryStorage.'
                    );
                }

                originalTempFiles.push(incomingPath);

                await fs.promises.rename(
                    incomingPath,
                    stagedPath
                );

            } else {
                throw new Error(
                    `Invalid uploaded file for field: ${key}`
                );
            }

            stagedFiles.push(stagedPath);

            return stagedPath;
        };

        try {

            // 1. Basic validation

            if (!userId) {
                return {
                    status: 0,
                    httpStatus: 401,
                    message: 'Unauthorized. Please login again.'
                };
            }

            if (Number(userType) !== 3) {
                return {
                    status: 0,
                    httpStatus: 403,
                    message: 'Only drivers can update this profile.'
                };
            }

            data = data || {};
            files = files || {};

            // 2. Validate file MIME types

            const allowedMimeTypes = [
                'image/jpeg',
                'image/png',
                'image/webp',
                'application/pdf'
            ];

            for (const [key, file] of Object.entries(files)) {
                if (!file) continue;

                if (!allowedMimeTypes.includes(file.mimetype)) {
                    return {
                        status: 0,
                        httpStatus: 400,
                        message: `Invalid file type for ${key}. Only JPG, PNG, WEBP and PDF files are allowed.`
                    };
                }
            }

            // 3. Start transaction

            // connection = await dbPool.getConnection();

            await connection.beginTransaction();
            transactionStarted = true;

            // 4. Fetch driver

            const userResult = await AuthModel.getUserById(
                userId,
                connection
            );

            const user = Array.isArray(userResult)
                ? userResult[0]
                : userResult;

            if (!user || Number(user.user_type) !== 3) {
                return {
                    status: 0,
                    httpStatus: 404,
                    message: 'Driver not found.'
                };
            }

            if (
                Number(user.status) !== 1 &&
                Number(user.status) !== 2
            ) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: 'Your account is inactive or blocked.'
                };
            }

            // 5. Fetch existing vehicle

            const existingVehicle = await AuthModel.getVehicleByUserId(
                userId,
                connection
            );

            // 6. First-time required documents validation
            // Existing DB values + incoming files/data are considered.

            const hasValue = (value) =>
                value !== undefined &&
                value !== null &&
                String(value).trim() !== '';

            const requiredDocuments = [
                {
                    label: 'Driving licence number',
                    existing: user.dl_number,
                    incoming: data.dl_number
                },
                {
                    label: 'DL front image',
                    existing: user.dl_front,
                    incoming: files.dlFront
                },
                {
                    label: 'DL back image',
                    existing: user.dl_back,
                    incoming: files.dlBack
                },
                {
                    label: 'RC front image',
                    existing: existingVehicle?.rc_front,
                    incoming: files.rcFront
                },
                {
                    label: 'RC back image',
                    existing: existingVehicle?.rc_back,
                    incoming: files.rcBack
                }
            ];

            const missingDocuments = requiredDocuments
                .filter(item => !hasValue(item.existing) && !hasValue(item.incoming))
                .map(item => item.label);

            if (missingDocuments.length > 0) {
                return {
                    status: 0,
                    httpStatus: 400,
                    message: 'Please submit all required documents for your first profile submission.',
                    missing_fields: missingDocuments
                };
            }

            // 7. Duplicate email validation

            if (
                data.email !== undefined &&
                data.email !== null &&
                String(data.email).trim() !== ''
            ) {
                const email = String(data.email)
                    .trim()
                    .toLowerCase();

                const emailResult = await AuthModel.getUserByEmail(
                    email,
                    connection
                );

                const emailUser = Array.isArray(emailResult)
                    ? emailResult[0]
                    : emailResult;

                if (
                    emailUser &&
                    String(emailUser.id) !== String(userId)
                ) {
                    return {
                        status: 0,
                        httpStatus: 400,
                        message: 'Email is already registered.'
                    };
                }

                data.email = email;
            }

            // 8. Stage and save uploaded files

            const uploadedPaths = {};

            for (const [fileKey, config] of Object.entries(fileMap)) {

                const file = files[fileKey];

                if (!file) continue;

                const stagedPath = await stageIncomingFile(
                    file,
                    fileKey
                );

                const finalDirectory = path.join(
                    uploadRoot,
                    config.directory
                );

                await fs.promises.mkdir(
                    finalDirectory,
                    { recursive: true }
                );

                const fileName =
                    `${Date.now()}-${crypto.randomUUID()}${getSafeExtension(file)}`;

                const finalAbsolutePath = path.join(
                    finalDirectory,
                    fileName
                );

                await fs.promises.rename(
                    stagedPath,
                    finalAbsolutePath
                );

                permanentFiles.push(finalAbsolutePath);

                // DB mein sirf filename save hoga.
                uploadedPaths[fileKey] = fileName;
            }

            // 9. Prepare user data

            const userData = {};

            const userFieldMap = {
                first_name: 'first_name',
                last_name: 'last_name',
                email: 'email',
                aadhaar_number: 'aadhar_number',
                dl_number: 'dl_number',
                pan: 'pan'
            };

            for (const [requestKey, dbColumn] of Object.entries(userFieldMap)) {

                if (
                    Object.prototype.hasOwnProperty.call(data, requestKey)
                ) {
                    userData[dbColumn] = data[requestKey];
                }
            }

            const userFileKeys = [
                'profileImage',
                'aadhaarFront',
                'aadhaarBack',
                'dlFront',
                'dlBack',
                'panImage'
            ];

            for (const fileKey of userFileKeys) {
                if (uploadedPaths[fileKey]) {
                    userData[fileMap[fileKey].column] =
                        uploadedPaths[fileKey];
                }
            }

            // 10. Reset only the relevant document verification status.
            // These columns must exist in users table.

            if (files.aadhaarFront || files.aadhaarBack) {
                userData.aadhar_status = 0;
                userData.aadhar_rejection_reason = null;
            }

            if (files.panImage || hasValue(data.pan) && data.pan !== user.pan) {
                userData.pan_status = 0;
                userData.pan_rejection_reason = null;
            }

            if (
                files.dlFront ||
                files.dlBack ||
                (hasValue(data.dl_number) && data.dl_number !== user.dl_number)
            ) {
                userData.dl_status = 0;
                userData.dl_rejection_reason = null;
            }

            if (Object.keys(userData).length > 0) {
                await AuthModel.updateUser(
                    userId,
                    userData,
                    connection
                );
            }

            // 11. Prepare vehicle data

            const vehicleData = {};

            const vehicleFieldMap = {
                vehicle_type: 'vehicle_type',
                vehicle_number: 'vehicle_number',
                brand: 'brand',
                model: 'model',
                color: 'color',
                fuel_type: 'fuel_type'
            };

            for (const [requestKey, dbColumn] of Object.entries(vehicleFieldMap)) {
                if (
                    Object.prototype.hasOwnProperty.call(data, requestKey)
                ) {
                    vehicleData[dbColumn] = data[requestKey];
                }
            }

            const vehicleFileKeys = [
                'vehiclePhoto',
                'rcFront',
                'rcBack'
            ];

            for (const fileKey of vehicleFileKeys) {
                if (uploadedPaths[fileKey]) {
                    vehicleData[fileMap[fileKey].column] =
                        uploadedPaths[fileKey];
                }
            }

            // 12. Reset RC verification only when RC is re-uploaded

            const rcResubmitted = Boolean(
                files.rcFront || files.rcBack
            );

            if (rcResubmitted) {
                vehicleData.rc_status = 0;
                vehicleData.status = 0;
                vehicleData.rejection_reason = null;
            }

            // 13. Insert/update vehicle only if vehicle data exists

            if (Object.keys(vehicleData).length > 0) {

                if (existingVehicle) {

                    await AuthModel.updateVehicle(
                        userId,
                        vehicleData,
                        connection
                    );

                } else {

                    await AuthModel.createVehicle(
                        {
                            user_id: userId,
                            vehicle_type: vehicleData.vehicle_type ?? null,
                            vehicle_number: vehicleData.vehicle_number ?? null,
                            brand: vehicleData.brand ?? null,
                            model: vehicleData.model ?? null,
                            color: vehicleData.color ?? null,
                            fuel_type: vehicleData.fuel_type ?? null,
                            vehicle_photo: vehicleData.vehicle_photo ?? null,
                            rc_front: vehicleData.rc_front ?? null,
                            rc_back: vehicleData.rc_back ?? null,
                            is_primary: 1,
                            status: vehicleData.status ?? 0,
                            rc_status: vehicleData.rc_status ?? 0,
                            rejection_reason: vehicleData.rejection_reason ?? null
                        },
                        connection
                    );
                }
            }

            // 14. If any verification document is resubmitted,
            // driver remains pending until admin verifies again.

            const verificationDocumentResubmitted = Boolean(
                files.aadhaarFront ||
                files.aadhaarBack ||
                files.panImage ||
                files.dlFront ||
                files.dlBack ||
                files.rcFront ||
                files.rcBack ||
                (hasValue(data.pan) && data.pan !== user.pan) ||
                (hasValue(data.dl_number) && data.dl_number !== user.dl_number)
            );

            if (verificationDocumentResubmitted && Number(user.status) === 1) {
                await connection.execute(
                    `UPDATE users SET status = 2, updated_at = NOW()
                    WHERE id = ? AND user_type = 3 AND deleted_at IS NULL`,
                    [userId]
                );
            }

            // 15. Fetch updated data

            const updatedUserResult = await AuthModel.getUserById(
                userId,
                connection
            );

            const updatedUser = Array.isArray(updatedUserResult)
                ? updatedUserResult[0]
                : updatedUserResult;

            const updatedVehicle = await AuthModel.getVehicleByUserId(
                userId,
                connection
            );

            if (updatedUser) {
                delete updatedUser.password;
                delete updatedUser.password_hash;
                delete updatedUser.deleted_at;
            }

            // 16. Commit

            await connection.commit();
            transactionCommitted = true;

            return {
                status: 1,
                httpStatus: 200,
                message: verificationDocumentResubmitted
                    ? 'Document uploaded successfully. Verification is pending.'
                    : 'Driver profile updated successfully.',
                data: {
                    user: updatedUser,
                    vehicle: updatedVehicle
                }
            };

        } catch (error) {

            if (
                connection &&
                transactionStarted &&
                !transactionCommitted
            ) {
                try {
                    await connection.rollback();
                    transactionStarted = false;
                } catch (rollbackError) {
                    console.error(
                        'Update profile rollback error:',
                        rollbackError
                    );
                }
            }

            console.error(
                'AuthService.updateProfile error:',
                error
            );

            for (const filePath of permanentFiles) {
                await safeRemove(filePath);
            }

            throw error;

        } finally {

            // Remove incoming Multer temp files

            for (const file of Object.values(files || {})) {
                if (!file || !file.path) continue;

                const incomingPath = path.resolve(file.path);

                const resolvedTempRoot =
                    path.resolve(tempRoot) + path.sep;

                if (incomingPath.startsWith(resolvedTempRoot)) {
                    await safeRemove(incomingPath);
                }
            }

            // Rollback if transaction was not committed

            if (
                connection &&
                transactionStarted &&
                !transactionCommitted
            ) {
                try {
                    await connection.rollback();
                    transactionStarted = false;
                } catch (rollbackError) {
                    console.error(
                        'Update profile rollback error:',
                        rollbackError
                    );
                }
            }

            for (const filePath of stagedFiles) {
                await safeRemove(filePath);
            }

            for (const filePath of originalTempFiles) {
                await safeRemove(filePath);
            }

            if (connection) {
                connection.release();
            }

            try {
                await fs.promises.rm(
                    requestTempDir,
                    {
                        recursive: true,
                        force: true
                    }
                );
            } catch (cleanupError) {
                console.error(
                    'Temporary upload directory cleanup error:',
                    cleanupError
                );
            }
        }
    }


    /**
     * Get Settings
     */
    async getSettings(connection) {
        const settings = await AuthModel.getSettings(connection);
        return {
            status: 1,
            message: 'Settings fetched successfully',
            data: settings
        };
    }

}

module.exports = new AuthService();