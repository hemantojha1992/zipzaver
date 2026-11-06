
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadRoot = path.join(__dirname, '..', 'uploads');
// Reusable upload utility
const uploadFiles = (folderConfig, maxFileSize = 5) => {

    // Step 1: Files temporarily RAM mein rahengi
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: maxFileSize * 1024 * 1024
        }
    }).fields(
        Object.keys(folderConfig).map(fieldName => ({
            name: fieldName,
            maxCount: 1
        }))
    );

    // Step 2: Multipart form-data parse karna
    const parse = (req, res, next) => {
        upload(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    status: 0,
                    message: err.message,
                    code: err.code || null,
                    field: err.field || null
                });
            }

            next();
        });
    };

    // Step 3: Validation ke baad files disk par save karna
    const save = async (req, res, next) => {
        const savedFiles = [];

        try {
            const files = req.files || {};

            for (const fieldName of Object.keys(files)) {

                const relativeFolder = folderConfig[fieldName];

                if (!relativeFolder) {
                    throw new Error(`Invalid upload field: ${fieldName}`);
                }

                const destination = path.resolve(
                    uploadRoot,
                    relativeFolder
                );
                // Security: uploads folder ke bahar save na ho
                if (
                    destination !== uploadRoot &&
                    !destination.startsWith(uploadRoot + path.sep)
                ) {
                    throw new Error('Invalid upload folder.');
                }

                await fs.promises.mkdir(destination, {
                    recursive: true
                });

                for (const file of files[fieldName]) {

                    const ext = path.extname(file.originalname).toLowerCase();

                    const filename =
                        `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

                    const filePath = path.join(destination, filename);

                    await fs.promises.writeFile(filePath, file.buffer);

                    savedFiles.push(filePath);

                    // File object mein disk details set karna
                    file.destination = destination;
                    file.filename = filename;
                    file.path = filePath;
                }
            }

            next();

        } catch (error) {

            // Error aane par already saved files delete karna
            await Promise.all(
                savedFiles.map(filePath =>
                    fs.promises.unlink(filePath).catch(() => {})
                )
            );

            console.error('File Save Error:', error);

            return res.status(500).json({
                status: 0,
                message: 'Unable to save uploaded files.',
                details: error.message
            });
        }
    };

    return {
        parse,
        save
    };
};

module.exports = uploadFiles;
