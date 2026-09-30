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
});



module.exports = {
    authSchema,
    sendOtpSchema,
    verifyOtpSchema

};
