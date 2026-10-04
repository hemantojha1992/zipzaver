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

    async updateProfile(userId,userType,data,files) {

        try {

            // -----------------------------------
            // 1. Validate user ID
            // -----------------------------------
            if (!userId) {
                return {
                    status: 0,
                    message: 'User not found'
                };
            }

            // -----------------------------------
            // 2. Validate user type
            // -----------------------------------
            userType = parseInt(userType, 10);

            if (![2, 3].includes(userType)) {
                return {
                    status: 0,
                    message: 'Invalid user type'
                };
            }

            // -----------------------------------
            // 3. Get user
            // -----------------------------------
            const users =
                await AuthModel.getUserById(userId);

            if (
                !Array.isArray(users) ||
                users.length === 0
            ) {
                return {
                    status: 0,
                    message: 'User not found'
                };
            }

            const user = users[0];

            // -----------------------------------
            // 4. Verify user type from DB
            // -----------------------------------
            if (
                Number(user.user_type) !==
                Number(userType)
            ) {
                return {
                    status: 0,
                    message: 'Invalid user type'
                };
            }

            // -----------------------------------
            // 5. Check account status
            // -----------------------------------
            if (Number(user.status) === 0) {
                return {
                    status: 0,
                    message: 'Your account is inactive'
                };
            }

            if (Number(user.status) === 2) {
                return {
                    status: 0,
                    message: 'Your account is blocked'
                };
            }

            // -----------------------------------
            // 6. Email duplicate check
            // -----------------------------------
            if (data.email) {

                const existingUser =
                    await AuthModel.getUserByEmail(
                        data.email
                    );

                if (
                    Array.isArray(existingUser) &&
                    existingUser.length > 0 &&
                    Number(existingUser[0].id) !==
                    Number(userId)
                ) {
                    return {
                        status: 0,
                        message: 'Email is already registered'
                    };
                }
            }

            // -----------------------------------
            // 7. Profile image
            // -----------------------------------
            let profileImage = null;

            if (files && files.profileImage) {

                profileImage =
                    files.profileImage.filename ||
                    files.profileImage.path ||
                    null;
            }

            // -----------------------------------
            // 8. Update users table
            // -----------------------------------
            const updateUserData = {

                first_name: data.first_name,

                last_name: data.last_name,

                email: data.email || null
            };

            if (profileImage) {
                updateUserData.profile_image =
                    profileImage;
            }

            const updateUserResult =
                await AuthModel.updateUser(
                    userId,
                    updateUserData
                );

            if (!updateUserResult) {
                return {
                    status: 0,
                    message: 'Unable to update profile'
                };
            }

            // -----------------------------------
            // 9. Aadhaar document
            // -----------------------------------

            const existingAadhaar =
                await AuthModel.getUserDocument(
                    userId,
                    'AADHAAR'
                );

            // Aadhaar front
            let aadhaarFront = null;

            if (files && files.aadhaarFront) {

                aadhaarFront =
                    files.aadhaarFront.filename ||
                    files.aadhaarFront.path ||
                    null;
            }

            // Aadhaar back
            let aadhaarBack = null;

            if (files && files.aadhaarBack) {

                aadhaarBack =
                    files.aadhaarBack.filename ||
                    files.aadhaarBack.path ||
                    null;
            }

            if (
                Array.isArray(existingAadhaar) &&
                existingAadhaar.length > 0
            ) {

                // -----------------------------------
                // Update existing Aadhaar
                // -----------------------------------

                const oldAadhaar =
                    existingAadhaar[0];

                await AuthModel.updateUserDocument(
                    userId,
                    'AADHAAR',
                    {
                        document_number:
                            data.aadhaar_number,

                        document_front:
                            aadhaarFront ||
                            oldAadhaar.document_front,

                        document_back:
                            aadhaarBack ||
                            oldAadhaar.document_back,

                        verification_status: 0,

                        rejection_reason: null
                    }
                );

            } else {

                // -----------------------------------
                // Create new Aadhaar
                // -----------------------------------

                const documentResult =
                    await AuthModel.createUserDocument({
                        user_id: userId,

                        document_type: 'AADHAAR',

                        document_number:
                            data.aadhaar_number,

                        document_front:
                            aadhaarFront,

                        document_back:
                            aadhaarBack,

                        verification_status: 0
                    });

                if (!documentResult) {
                    return {
                        status: 0,
                        message:
                            'Unable to save Aadhaar document'
                    };
                }
            }

            // -----------------------------------
            // 10. Driver profile
            // -----------------------------------

            if (Number(userType) === 3) {

                const driverProfile =
                    await AuthModel.getDriverProfile(
                        userId
                    );

                if (
                    !Array.isArray(driverProfile) ||
                    driverProfile.length === 0
                ) {

                    // Create driver profile
                    await AuthModel.createDriverProfile({
                        user_id: userId,
                        approval_status: 0
                    });

                } else {

                    // Existing driver
                    // Again pending for verification
                    await AuthModel.updateDriverProfile(
                        userId,
                        {
                            approval_status: 0,
                            rejection_reason: null
                        }
                    );
                }
            }

            // -----------------------------------
            // 11. Get updated user
            // -----------------------------------
            const updatedUsers =
                await AuthModel.getUserById(userId);

            const updatedUser =
                updatedUsers[0];

            // -----------------------------------
            // 12. Remove sensitive data
            // -----------------------------------
            delete updatedUser.password;
            delete updatedUser.deleted_at;

            // -----------------------------------
            // 13. Response
            // -----------------------------------
            if (Number(userType) === 3) {

                return {
                    status: 1,
                    message:
                        'Profile updated successfully. Your profile is pending for verification.',
                    data: {
                        user: updatedUser,
                        driver: {
                            approval_status: 0,
                            approval_status_text: 'Pending'
                        }
                    }
                };

            }

            return {
                status: 1,
                message: 'Profile updated successfully.',
                data: {
                    user: updatedUser
                }
            };

        } catch (error) {

            console.error(
                'updateProfile service error:',
                error
            );

            return {
                status: 0,
                message: 'Unable to update profile',
                details: error.message || 'Unknown error'
            };
        }
    }

}
module.exports = new AuthService();