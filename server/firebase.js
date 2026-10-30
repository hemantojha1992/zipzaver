// const admin = require('firebase-admin');
// const path = require('path');
// const serviceAccountPath = path.resolve(
//     process.env.FIREBASE_SERVICE_ACCOUNT_PATH
// );
// if (!admin.apps.length) {
//     const serviceAccount = require(serviceAccountPath);
//     admin.initializeApp({
//         credential: admin.credential.cert(serviceAccount)
//     });
// }
// module.exports = admin;


const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

module.exports = admin;