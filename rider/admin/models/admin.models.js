const dbPool = require('../../database/db');
const md5 = require('md5')
const moment = require('moment');
const mysql = require('mysql2');
const { setCacheData, getCacheData } = require('../../../shared/redis/Redis');

class AdminModel {
    async getUser(email, password) {
        try {
            const sql = 'SELECT u.*FROM users as u WHERE u.user_type =1 AND email = ? AND password = ? ';
            const [result] = await dbPool.query(sql, [email, md5(password)]);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async getUserWithId(userId) {
        try {
            const sql = `SELECT * FROM users WHERE  id= '${userId}' `;
            const [result] = await dbPool.query(sql);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async updateToken(userId, token) {
        try {
            const sql = 'UPDATE users SET token = ? WHERE  id=?';
            const result = await dbPool.query(sql, [token, userId]);
            const affectedRows = result[0] ? result[0].affectedRows : 0;
            if (result && affectedRows > 0) {
                return await this.getUserWithId(userId);
            } else {
                throw new Error('User not found or token not updated');
            }
        } catch (error) {
            throw new Error('Failed to update user token');
        }
    }


}

module.exports = new AdminModel();