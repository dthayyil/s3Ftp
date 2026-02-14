import FtpSrv from 'ftp-srv';
import http from 'http';
import { config } from './config.js';
import { S3FileSystem } from './s3-filesystem.js';
import logger from './logger.js';

// Initialize S3 filesystem
const s3fs = new S3FileSystem();

// Create FTP server
const ftpServer = new FtpSrv({
    url: `ftp://0.0.0.0:${config.ftp.port}`,
    pasv_url: config.ftp.pasv_url || '127.0.0.1',
    pasv_min: config.ftp.pasv_min,
    pasv_max: config.ftp.pasv_max,
    greeting: ['Welcome to S3 FTP Server', 'Powered by AWS S3'],
    anonymous: false,
    timeout: 300000, // 120 second timeout for connections
    log: logger
});

// Authentication handler
ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
    logger.info('Login attempt', { username, ip: connection.ip });

    if (username === config.ftp.user && password === config.ftp.password) {
        logger.info('Login successful', { username });

        // Return custom filesystem
        resolve({
            fs: createFtpFileSystem(connection),
            root: '/',
            cwd: '/'
        });
    } else {
        logger.warn('Login failed', { username, ip: connection.ip });
        reject(new Error('Invalid username or password'));
    }
});

// Create FTP-compatible filesystem wrapper
function createFtpFileSystem(connection) {
    return {
        // Get current working directory
        currentDirectory() {
            return connection.fs.cwd || '/';
        },

        // Get file/directory info
        async get(filePath) {
            try {
                const stats = await s3fs.stat(filePath);
                return {
                    name: filePath.split('/').pop() || '/',
                    isDirectory: () => stats.isDirectory,
                    size: stats.size,
                    mtime: stats.modified,
                    mode: stats.isDirectory ? 16877 : 33188,
                    uid: 1000,
                    gid: 1000
                };
            } catch (error) {
                logger.error('Error getting file info', { path: filePath, error: error.message });
                throw error;
            }
        },

        // List directory
        async list(dirPath = '/') {
            try {
                const items = await s3fs.list(dirPath);
                return items.map(item => ({
                    name: item.name,
                    isDirectory: () => item.isDirectory,
                    size: item.size,
                    mtime: item.modified,
                    mode: item.isDirectory ? 16877 : 33188,
                    uid: 1000,
                    gid: 1000
                }));
            } catch (error) {
                logger.error('Error listing directory', { path: dirPath, error: error.message });
                return [];
            }
        },

        // Create read stream
        async read(filePath, { start = 0 } = {}) {
            try {
                const stream = await s3fs.read(filePath);

                // Add error handler to prevent unhandled errors
                stream.on('error', (error) => {
                    logger.error('Read stream error', { path: filePath, error: error.message });
                });

                if (start > 0) {
                    // Skip to start position if needed
                    let bytesRead = 0;
                    stream.on('data', (chunk) => {
                        bytesRead += chunk.length;
                        if (bytesRead < start) {
                            stream.pause();
                            stream.resume();
                        }
                    });
                }

                return stream;
            } catch (error) {
                logger.error('Error reading file', { path: filePath, error: error.message });
                throw error;
            }
        },

        // Create write stream
        async write(filePath, { append = false, start = 0 } = {}) {
            try {
                const { Writable } = await import('stream');
                const chunks = [];

                const writeStream = new Writable({
                    write(chunk, encoding, callback) {
                        chunks.push(chunk);
                        callback();
                    },
                    async final(callback) {
                        try {
                            const buffer = Buffer.concat(chunks);
                            await s3fs.write(filePath, buffer);
                            callback();
                        } catch (error) {
                            callback(error);
                        }
                    }
                });

                // Add error handler to prevent unhandled errors
                writeStream.on('error', (error) => {
                    logger.error('Write stream error', { path: filePath, error: error.message });
                });

                return writeStream;
            } catch (error) {
                logger.error('Error writing file', { path: filePath, error: error.message });
                throw error;
            }
        },

        // Delete file
        async delete(filePath) {
            try {
                const stats = await s3fs.stat(filePath);

                if (stats.isDirectory) {
                    await s3fs.deleteDirectory(filePath);
                } else {
                    await s3fs.delete(filePath);
                }
            } catch (error) {
                logger.error('Error deleting', { path: filePath, error: error.message });
                throw error;
            }
        },

        // Create directory
        async mkdir(dirPath) {
            try {
                await s3fs.mkdir(dirPath);
            } catch (error) {
                logger.error('Error creating directory', { path: dirPath, error: error.message });
                throw error;
            }
        },

        // Rename/move
        async rename(oldPath, newPath) {
            try {
                await s3fs.rename(oldPath, newPath);
            } catch (error) {
                logger.error('Error renaming', { from: oldPath, to: newPath, error: error.message });
                throw error;
            }
        },

        // Change directory
        async chdir(dirPath) {
            try {
                const exists = await s3fs.exists(dirPath);
                if (!exists) {
                    throw new Error('Directory does not exist');
                }
                connection.fs.cwd = dirPath;
                return dirPath;
            } catch (error) {
                logger.error('Error changing directory', { path: dirPath, error: error.message });
                throw error;
            }
        }
    };
}

// Error handlers
ftpServer.on('error', (error) => {
    logger.error('FTP Server error', { error: error.message, stack: error.stack });
});

ftpServer.on('client-error', ({ connection, context, error }) => {
    // Suppress logging for expected socket errors during client disconnection
    if (error.message && error.message.includes('Socket not writable')) {
        logger.debug('Client socket closed during operation', {
            ip: connection.ip,
            context
        });
    } else {
        logger.error('Client error', {
            ip: connection.ip,
            context,
            error: error.message
        });
    }
});

// Connection handlers
ftpServer.on('disconnect', ({ connection }) => {
    logger.info('Client disconnected', { ip: connection.ip });
});

// Health check HTTP server
const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            service: 's3-ftp-server',
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Start servers
async function start() {
    try {
        // Start FTP server
        await ftpServer.listen();
        logger.info('FTP Server started', {
            port: config.ftp.port,
            pasv_range: `${config.ftp.pasv_min}-${config.ftp.pasv_max}`,
            pasv_url: config.ftp.pasv_url
        });

        const RENDER_PORT = process.env.PORT || config.server.healthCheckPort || 3000;
        // Start health check server
        healthServer.listen(RENDER_PORT, '0.0.0.0', () => {
            logger.info('Health check server started', {
                port: RENDER_PORT
            });
        });

        logger.info('S3 FTP Server is ready', {
            bucket: config.aws.bucket,
            region: config.aws.region
        });
    } catch (error) {
        logger.error('Failed to start server', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');

    try {
        await ftpServer.close();
        healthServer.close();
        logger.info('Server closed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');

    try {
        await ftpServer.close();
        healthServer.close();
        logger.info('Server closed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
    }
});

// Start the server
start();
