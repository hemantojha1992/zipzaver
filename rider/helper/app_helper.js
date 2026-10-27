const { get_application_module_details } = require("../models/moduleModel");
const CustomModel = require('../models/CustomDbModel');
const moment = require('moment');
function generateAppTransactionReference(modPrefix = '', addProjectPrefix = true) {
    if (!modPrefix) {
        modPrefix = 'REF';
    }
    let ref = '';
    return ref + modPrefix + '-' + generateUniqueReferenceId();
}

function generateUniqueReferenceId() {
    const formattedDate = moment().format('DDMMY');
    const randomNumbers = `${getRandomInt(10, 99)}${getRandomInt(10, 99)}`;
    return formattedDate + '-' + moment().format('Hmmss')+'-'+randomNumbers;
}
module.exports = { generateAppTransactionReference, generateUniqueReferenceId }
