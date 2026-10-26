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
    // Personal details - optional
    first_name: Joi.string().trim().min(2).max(150).optional(),
    last_name: Joi.string().trim().min(1).max(255).optional(),
    email: Joi.string().trim().lowercase().email().max(150).allow('', null).optional(),

    // Other documents - optional
    aadhaar_number: Joi.string()
    .trim()
    .pattern(/^\d{12}$/)
    .allow('', null)
    .optional(),
    aadhaar_front: Joi.any().optional(),
    aadhaar_back: Joi.any().optional(),
    pan: Joi.string().trim().max(255).allow('').optional(),

    // DL details
    dl_number: Joi.string().trim().max(255).required(),

    // Vehicle details - optional
    vehicle_type: Joi.string().trim().max(50).optional(),
    vehicle_number: Joi.string().trim().max(20).optional(),
    brand: Joi.string().trim().max(100).optional(),
    model: Joi.string().trim().max(100).optional(),
    color: Joi.string().trim().max(50).allow('').optional(),
    fuel_type: Joi.string().trim().max(30).allow('').optional(),

    // File fields are uploaded through Multer
}).unknown(false);




module.exports = {
    authSchema,
    sendOtpSchema,
    verifyOtpSchema,
    updateProfileSchema

};
