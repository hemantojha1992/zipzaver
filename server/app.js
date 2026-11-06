const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const moduleAlias = require('module-alias');
const http = require('http');
moduleAlias.addAliases({
  '@envConfig': path.resolve(__dirname, '../envConfig.js'),
});
require('@envConfig');
require('../shared/constant');
require('../rider/constant')

const RideService = require('../rider/ride/services/ride.service');

// const { SessionSchema } = require('./session');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
let corsObj = cors({ origin: '*', methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', credentials: true, optionsSuccessStatus: 200, });

// app.use(SessionSchema);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsObj);

// =====================================
// STATIC UPLOADS - IMPORTANT
// =====================================
const uploadPath = path.join(__dirname, '../uploads');

app.use(
    '/api/uploads',
    express.static(uploadPath)
);

//agent route
const RiderTokenValidate = require('../rider/middleware/validateMiddleware')
const RiderRoutes = require('../rider/routes');
app.use('/rider',RiderTokenValidate, RiderRoutes);
//agent route end

//Admin route
const AdminTokenValidate = require('../admin/middleware/validateMiddleware');
const AdminRoutes = require('../admin/routes');
app.use('/admin',AdminTokenValidate, AdminRoutes);
//Admin route end

app.get('/', (req, res) => {
  res.send({ status: SUCCESS_STATUS, data: 'from node' });
})
app.get('*', (req, res) => {
  res.status(404).send({ status: 0, message: "Method not supported" });
});


setInterval(async () => {

    try {
        await RideService.processExpiredRideRequests();
    } catch (error) {
        console.error('Ride timeout worker error:', error.message);
    }

}, 3000);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
