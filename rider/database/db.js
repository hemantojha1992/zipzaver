const mysql = require('mysql2/promise');
//require('@envConfig')
// Load environment variables from .env file
//dotenv.config();
// const dbpool = mysql.createPool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_DATABASE,
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });
// module.exports = dbpool;


const dbpool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, // IMPORTANT

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

dbpool.getConnection()
    .then(connection => {
        console.log('✅ Database connected successfully');
        connection.release();
    })
    .catch(error => {
        console.error('❌ Database connection failed');
        console.error('Code:', error.code);
        console.error('Message:', error.message);
    });

module.exports = dbpool;

