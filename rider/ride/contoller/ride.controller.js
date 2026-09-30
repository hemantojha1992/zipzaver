
const CustomMessages = require("../../utilities/customMessages");
let dbPool = require('../../database/db');
const RideModel = require('../models/ride.model');
const batch = require('../../database/GroupUpdateInsert');
const { setCacheData, getCacheData } = require("../../../shared/redis/Redis");

class RideController {
    async GetAirports(req, res) {
        let status = FAILURE_STATUS;
        let message = CustomMessages.DataNotFound();
        let errors = null;

        const { term, type } = req.query;

        let aprtListKey = 'all_airport_list_raw';
        let airportCacheList = await getCacheData(aprtListKey);
        if(!airportCacheList){
            let getFlightRawList = await RideModel.get_raw_airport_list();
            await setCacheData(aprtListKey, getFlightRawList);
        }

        let airlineListKey = 'all_airline_list_raw';
        let airlineCacheList = await getCacheData(airlineListKey);
        if(!airlineCacheList){
            let getAirlineRawList = await RideModel.get_raw_airline_list();
            await setCacheData(airlineListKey, getAirlineRawList);
        }
        let CacheKey =
            FLIGHT_BOOKING +
            DB_SAFE_SEPARATOR +
            (term ?? "") +
            DB_SAFE_SEPARATOR;

        let CacheDataGet = await getCacheData(CacheKey);

        // ✔ Cache hit but only if array has data
        if (CacheDataGet && Array.isArray(CacheDataGet) && CacheDataGet.length > 0) {
            return res.send({
                status: SUCCESS_STATUS,
                message: CustomMessages.successResponse(),
                data: CacheDataGet,
                //errors: null,
            });
        }

        //  Cache empty → fetch from DB
        try {
            CacheDataGet = await RideModel.get_airport_list(term);

            // If DB gives empty array → No Data Found
            if (!CacheDataGet || CacheDataGet.length === 0) {
                return res.send({
                    status: FAILURE_STATUS,
                    message: "Airport not found!",//CustomMessages.DataNotFound(),
                    // data: [],
                    //errors: null,
                });
            }

            // ✔ Save only if data exists
            await setCacheData(CacheKey, CacheDataGet, 604800);

            return res.send({
                status: SUCCESS_STATUS,
                message: CustomMessages.successResponse(),
                data: CacheDataGet,
            });

        } catch (error) {
            res.write(`data: ${JSON.stringify({
                status: FAILURE_STATUS,
                message: CustomMessages.somethingWrong(),
                data: [],
                errors: error?.message || error
            })}\n\n`);
            res.end();
        }

    }
}

module.exports = new RideController(); 
