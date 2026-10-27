
const multer = require('multer');
const path = require('path');
const fs = require('fs');

//const uploadDir = path.join(process.cwd(), 'uploads');
const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, filename);
    }
});

module.exports = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});
