const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const AuthModel = require('../models/auth.models');

const crypto = require('crypto');
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRATION || 5);
const MAX_OTP_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);


class AuthService {
    async login(searchData) {
        const { email, password } = searchData;

        try {
            const users = await AuthModel.getUser(email, password);

            if (!Array.isArray(users) || users.length === 0) {
                return {
                    status: 0,
                    message: CustomMessages.invalidCredErr('msg'),
                    details: CustomMessages.invalidCredErr(),
                };
            }

            let user = users[0];
            let privileges = user.privileges;
            let privilegesArray = [];
            if (privileges && privileges.length > 0) {
                privilegesArray = Array.isArray(privileges)
                    ? privileges
                    : privileges.split(',').map(p => p.trim());
            }

            
            const token = jwt.sign({user_id: user.user_id,user_type:user.user_type, uuid: user.uuid, privileges: privilegesArray }
                , process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRATION, algorithm: process.env.JWT_ALGORITHM, });
            try {
                let updateduser  = await AuthModel.updateToken(user.user_id, token);
                user = (Array.isArray(updateduser) || updateduser.length > 0)?updateduser:user;
                user.map(user => {
                    user.privileges = privilegesArray;
                    return user;
                });        
            } catch (err) {
                return {
                    status: 0,
                    message: 'Login Failed',
                    details: err.message,
                };
            }
            return {
                status: 1,
                message: CustomMessages.login(),
                token,
                data: user,
            }
        } catch (error) {
            return {
                status: 0,
                message: 'Something went our end please try after some time',
                details: error.message,
            };
        }
    }
    
    async logout(userId) {
        try {
            await AuthModel.updateToken(userId, null);
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
    async sendOtp(mobile, userType) {
        try {
            // -----------------------------------
            // 1. Validate mobile
            // -----------------------------------
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

            // -----------------------------------
            // 2. Validate user_type
            // -----------------------------------
            if (userType === undefined || userType === null || userType === '') {
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

            // -----------------------------------
            // 3. Find user
            // -----------------------------------
            let users = await AuthModel.getUserByMobile(mobile);
            let user;

            // -----------------------------------
            // 4. User does not exist
            // -----------------------------------
            if (!Array.isArray(users) || users.length === 0) {

                // Create new user with dynamic user_type
                const userResult = await AuthModel.createUser({
                    user_type: userType,
                    mobile: mobile,
                    status: 1
                });

                if (!userResult || !userResult.insertId) {
                    return {
                        status: 0,
                        message: 'Unable to create user'
                    };
                }

                // Get newly created user
                const newUsers = await AuthModel.getUserById(
                    userResult.insertId
                );

                if (!Array.isArray(newUsers) || newUsers.length === 0) {
                    return {
                        status: 0,
                        message: 'Unable to create user'
                    };
                }

                user = newUsers[0];

            } else {

                // -----------------------------------
                // Existing user
                // -----------------------------------
                user = users[0];
            }

            // -----------------------------------
            // 5. Check account status
            // -----------------------------------
            if (user.status === 0) {
                return {
                    status: 0,
                    message: 'Your account is inactive'
                };
            }

            if (user.status === 2) {
                return {
                    status: 0,
                    message: 'Your account is blocked'
                };
            }

            // -----------------------------------
            // 6. Generate OTP
            // -----------------------------------
            const otp = this.generateOtp();

            const otpHash = this.hashOtp(otp);

            // -----------------------------------
            // 7. OTP expiry
            // -----------------------------------
            const expiresAt = new Date(
                Date.now() +
                OTP_EXPIRY_MINUTES * 60 * 1000
            );

            // -----------------------------------
            // 8. Expire previous OTP
            // -----------------------------------
            await AuthModel.expirePreviousOtps(
                mobile,
                'LOGIN'
            );

            // -----------------------------------
            // 9. Create new OTP
            // -----------------------------------
            await AuthModel.createOtp({
                user_id: user.id,
                mobile: mobile,
                otp_type: 'LOGIN',
                otp_hash: otpHash,
                attempts: 0,
                max_attempts: MAX_OTP_ATTEMPTS,
                expires_at: expiresAt
            });

            // -----------------------------------
            // 10. Send SMS
            // -----------------------------------
            /*
            await SmsService.sendOtp(
                mobile,
                otp
            );
            */

            // Development only
            console.log(`OTP for ${mobile}: ${otp}`);

            // -----------------------------------
            // 11. Response
            // -----------------------------------
            return {
                status: 1,
                message: 'OTP sent successfully',
                otp: otp, // Remove this in production
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
    async verifyOtp(mobile, otp, device = {}) {
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

            // Find user
            const users = await AuthModel.getUserByMobile(mobile);

            if (!Array.isArray(users) || users.length === 0) {
                return {
                    status: 0,
                    message: 'User not found'
                };
            }

            const user = users[0];

            // Check user status
            if (user.status === 0) {
                return {
                    status: 0,
                    message: 'Your account is inactive'
                };
            }

            if (user.status === 2) {
                return {
                    status: 0,
                    message: 'Your account is blocked'
                };
            }

            // Get latest pending OTP
            const otpRecord = await AuthModel.getLatestPendingOtp(
                mobile,
                'LOGIN'
            );

            if (!otpRecord) {
                return {
                    status: 0,
                    message: 'OTP expired or not found'
                };
            }

            // Check expiry
            if (new Date(otpRecord.expires_at) < new Date()) {
                await AuthModel.markOtpExpired(otpRecord.id);

                return {
                    status: 0,
                    message: 'OTP has expired'
                };
            }

            // Check attempts
            if (otpRecord.attempts >= otpRecord.max_attempts) {
                await AuthModel.markOtpBlocked(otpRecord.id);

                return {
                    status: 0,
                    message: 'Maximum OTP attempts exceeded'
                };
            }

            // Hash entered OTP
            const otpHash = this.hashOtp(otp);

            // Compare OTP
            if (otpHash !== otpRecord.otp_hash) {
                await AuthModel.incrementOtpAttempt(otpRecord.id);

                const remainingAttempts =
                    otpRecord.max_attempts - (otpRecord.attempts + 1);

                if (remainingAttempts <= 0) {
                    await AuthModel.markOtpBlocked(otpRecord.id);

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

            // OTP verified successfully
            await AuthModel.markOtpVerified(otpRecord.id);

            // Update last login
            await AuthModel.updateLastLogin(user.id);

            // Save device details after successful OTP verification
            if (device.device_id && device.device_type) {
                await AuthModel.saveUserDevice(user.id, {
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

            // User privileges
            let privileges = user.privileges;
            let privilegesArray = [];

            if (privileges && privileges.length > 0) {
                privilegesArray = Array.isArray(privileges)
                    ? privileges
                    : privileges
                        .split(',')
                        .map(p => p.trim());
            }

            // JWT payload
            const tokenPayload = {
                user_id: user.id,
                user_type: user.user_type,
                privileges: privilegesArray
            };

            if (user.uuid) {
                tokenPayload.uuid = user.uuid;
            }

            // Generate JWT
            const token = jwt.sign(
                tokenPayload,
                process.env.JWT_SECRET,
                {
                    expiresIn: process.env.JWT_EXPIRATION,
                    algorithm: process.env.JWT_ALGORITHM
                }
            );

            // Never send password hash in response
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
    async resendOtp(mobile) {

        return await this.sendOtp(mobile);
    }
    static async updateProfile(userId, userType, data, files = {}) {
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

            // DL number and all four DL/RC images are required
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

            // Fetch driver
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

            // Check duplicate email only when a non-empty email is supplied
            if (data.email !== undefined && data.email !== null &&
                String(data.email).trim() !== '') {

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

            // Only supplied fields are updated
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

            // Use the project's existing Multer filename/path convention
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
                const path = getFilePath(files[fileKey]);
                if (path !== undefined) {
                    userData[dbColumn] = path;
                }
            }

            // Update user only if there are fields to update
            if (Object.keys(userData).length > 0) {
                await AuthModel.updateUser(userId, userData);
            }

            // Prepare vehicle update; omitted optional fields remain unchanged
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
                const path = getFilePath(files[fileKey]);
                if (path !== undefined) {
                    vehicleData[dbColumn] = path;
                }
            }

            // DL/RC verification documents are being resubmitted
            vehicleData.status = 0;
            vehicleData.rejection_reason = null;

            const existingVehicle = await AuthModel.getVehicleByUserId(userId);

            if (existingVehicle) {
                await AuthModel.updateVehicle(userId, vehicleData);
            } else {
                // The vehicles table must allow omitted optional fields to be NULL
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
            console.error('AuthService.updateProfile error:', error);
            throw error;
        }
    }

}
module.exports = new AuthService();