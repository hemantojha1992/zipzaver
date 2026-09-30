const dbPool = require('../../database/db');
const moment = require('moment');
const mysql = require('mysql2');
const { setCacheData, getCacheData } = require('../../../shared/redis/Redis');


class rideModel {

    static async get_raw_airport_list() {

        let query = `Select airport_code,airport_name,airport_city,country from flight_airport_list`;
        const [airports] = await dbPool.query(query);
        let result;
        if (airports && typeof airports === 'object') {
            result = airports.reduce((acc, item) => {
                const { airport_code, ...rest } = item;

                acc[airport_code] = rest;

                return acc;
            }, {});
        }
        return result;
    }
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





}

module.exports = rideModel;