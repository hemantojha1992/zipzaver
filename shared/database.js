const mysql = require('mysql2/promise');

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
        connection.release();
    })
    .catch(error => {
        console.error('❌ Database connection failed');
        console.error('Code:', error.code);
        console.error('Message:', error.message);
    });

module.exports = dbpool;

