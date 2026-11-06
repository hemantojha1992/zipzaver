const Joi = require('joi');
const CustomMessages = require('../../utilities/customMessages');

const authSchema = Joi.object({
    email: Joi.string()
        .required()
        .email({ tlds: { allow: false } })
        .messages({
            'string.base': CustomMessages.emailIsEmail(),
            'string.email': CustomMessages.emailIsEmail(),
            'string.empty': CustomMessages.emailNotEmpty(),
            'any.required': CustomMessages.emailNotEmpty(),
        }),
    password: Joi.string().required().messages({
        'string.empty': CustomMessages.passwordIsRequired(),
        'any.required': CustomMessages.passwordIsRequired(),
    }),
})
const sendOtpSchema = Joi.object({
    mobile: Joi.string()
        .trim()
        .required()
        .pattern(/^[6-9]\d{9}$/)
        .messages({
            'string.base': 'Mobile number must be a string',
            'string.empty': 'Mobile number is required',
            'any.required': 'Mobile number is required',
            'string.pattern.base': 'Please enter a valid mobile number',
        }),

    user_type: Joi.number()
        .integer()
        .required()
        .valid(1, 2, 3)
        .messages({
            'number.base': 'User type must be a number',
            'number.integer': 'User type must be an integer',
            'any.required': 'User type is required',
            'any.only': 'Invalid user type',
        }),
});

const verifyOtpSchema = Joi.object({
    mobile: Joi.string()
        .trim()
        .required()
        .pattern(/^[6-9]\d{9}$/)
        .messages({
            'string.base': 'Mobile number must be a string',
            'string.empty': 'Mobile number is required',
            'any.required': 'Mobile number is required',
            'string.pattern.base': 'Please enter a valid mobile number',
        }),

    otp: Joi.string()
        .trim()
        .required()
        .pattern(/^\d{6}$/)
        .messages({
            'string.base': 'OTP must be a string',
            'string.empty': 'OTP is required',
            'any.required': 'OTP is required',
            'string.pattern.base': 'OTP must be 6 digits',
        }),

    device_id: Joi.string()
        .trim()
        .allow('', null)
        .optional(),

    device_type: Joi.string()
        .trim()
        .lowercase()
        .valid('android', 'ios', 'web')
        .optional()
        .messages({
            'any.only': 'Device type must be android, ios or web',
        }),

    fcm_token: Joi.string()
        .trim()
        .allow('', null)
        .optional(),
});



const updateProfileSchema = Joi.object({

    // Personal details
    first_name: Joi.string().trim().min(2).max(150).optional(),
    last_name: Joi.string().trim().min(1).max(255).optional(),

    email: Joi.string()
        .trim()
        .lowercase()
        .email()
        .max(150)
        .allow('', null)
        .optional(),

    // Aadhaar
    aadhaar_number: Joi.string()
        .trim()
        .pattern(/^\d{12}$/)
        .allow('', null)
        .optional(),

    aadhar_front: Joi.any().optional(),
    aadhar_back: Joi.any().optional(),

    // PAN
    pan: Joi.string()
        .trim()
        .uppercase()
        .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
        .allow('', null)
        .optional(),

    pan_image: Joi.any().optional(),

    // Driving License
    dl_number: Joi.string()
        .trim()
        .max(255)
        .allow('', null)
        .optional(),

    dl_front: Joi.any().optional(),
    dl_back: Joi.any().optional(),

    // Vehicle
    vehicle_type: Joi.string()
        .trim()
        .lowercase()
        .valid('bike', 'auto', 'car')
        .optional(),

    vehicle_number: Joi.string().trim().max(20).optional(),
    brand: Joi.string().trim().max(100).optional(),
    model: Joi.string().trim().max(100).optional(),
    color: Joi.string().trim().max(50).allow('', null).optional(),
    fuel_type: Joi.string().trim().max(30).allow('', null).optional(),

    vehicle_photo: Joi.any().optional(),
    rc_front: Joi.any().optional(),
    rc_back: Joi.any().optional(),

    // Profile
    profile_image: Joi.any().optional()

});


module.exports = {
    authSchema,
    sendOtpSchema,
    verifyOtpSchema,
    updateProfileSchema

};
