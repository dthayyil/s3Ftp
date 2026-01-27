import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import path from 'path';
import { config } from './config.js';
import logger from './logger.js';

export class S3FileSystem {
    constructor() {
        this.s3Client = new S3Client({
            region: config.aws.region,
            credentials: {
                accessKeyId: config.aws.accessKeyId,
                secretAccessKey: config.aws.secretAccessKey
            }
        });
        this.bucket = config.aws.bucket;
        logger.info('S3 FileSystem initialized', { bucket: this.bucket, region: config.aws.region });
    }

    // Normalize path (remove leading slash, ensure trailing slash for directories)
    normalizePath(filePath) {
        if (!filePath || filePath === '/' || filePath === '.') return '';
        return filePath.replace(/^\/+/, '').replace(/\/+$/, '');
    }

    // Get S3 key from FTP path
    getS3Key(filePath) {
        const normalized = this.normalizePath(filePath);
        return normalized || '';
    }

    // Check if path exists
    async exists(filePath) {
        try {
            const key = this.getS3Key(filePath);

            if (!key) {
                return true; // Root always exists
            }

            // Check if it's a file
            try {
                await this.s3Client.send(new GetObjectCommand({
                    Bucket: this.bucket,
                    Key: key
                }));
                return true;
            } catch (err) {
                if (err.name !== 'NoSuchKey') {
                    throw err;
                }
            }

            // Check if it's a directory (has objects with this prefix)
            const listCommand = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: key + '/',
                MaxKeys: 1
            });

            const response = await this.s3Client.send(listCommand);
            return response.Contents && response.Contents.length > 0;
        } catch (error) {
            logger.error('Error checking existence', { path: filePath, error: error.message });
            return false;
        }
    }

    // List directory contents
    async list(dirPath = '/') {
        try {
            const prefix = this.getS3Key(dirPath);
            const prefixWithSlash = prefix ? prefix + '/' : '';

            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefixWithSlash,
                Delimiter: '/'
            });

            const response = await this.s3Client.send(command);
            const items = [];

            // Add subdirectories
            if (response.CommonPrefixes) {
                for (const prefix of response.CommonPrefixes) {
                    const name = prefix.Prefix.slice(prefixWithSlash.length).replace('/', '');
                    if (name) {
                        items.push({
                            name,
                            isDirectory: true,
                            size: 0,
                            modified: new Date()
                        });
                    }
                }
            }

            // Add files
            if (response.Contents) {
                for (const obj of response.Contents) {
                    // Skip the directory itself
                    if (obj.Key === prefixWithSlash) continue;

                    const name = obj.Key.slice(prefixWithSlash.length);
                    if (name && !name.includes('/')) {
                        items.push({
                            name,
                            isDirectory: false,
                            size: obj.Size || 0,
                            modified: obj.LastModified || new Date()
                        });
                    }
                }
            }

            logger.info('Listed directory', { path: dirPath, itemCount: items.length });
            return items;
        } catch (error) {
            logger.error('Error listing directory', { path: dirPath, error: error.message });
            throw error;
        }
    }

    // Get file stats
    async stat(filePath) {
        try {
            const key = this.getS3Key(filePath);

            if (!key) {
                // Root directory
                return {
                    isDirectory: true,
                    size: 0,
                    modified: new Date()
                };
            }

            // Try to get object metadata
            try {
                const command = new GetObjectCommand({
                    Bucket: this.bucket,
                    Key: key
                });
                const response = await this.s3Client.send(command);

                return {
                    isDirectory: false,
                    size: response.ContentLength || 0,
                    modified: response.LastModified || new Date()
                };
            } catch (err) {
                if (err.name !== 'NoSuchKey') {
                    throw err;
                }
            }

            // Check if it's a directory
            const listCommand = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: key + '/',
                MaxKeys: 1
            });

            const response = await this.s3Client.send(listCommand);

            if (response.Contents && response.Contents.length > 0) {
                return {
                    isDirectory: true,
                    size: 0,
                    modified: new Date()
                };
            }

            throw new Error('File not found');
        } catch (error) {
            logger.error('Error getting file stats', { path: filePath, error: error.message });
            throw error;
        }
    }

    // Read file
    async read(filePath) {
        try {
            const key = this.getS3Key(filePath);

            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const response = await this.s3Client.send(command);
            logger.info('File read', { path: filePath, size: response.ContentLength });

            return response.Body;
        } catch (error) {
            logger.error('Error reading file', { path: filePath, error: error.message });
            throw error;
        }
    }

    // Write file
    async write(filePath, data) {
        try {
            const key = this.getS3Key(filePath);

            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: data
            });

            await this.s3Client.send(command);
            logger.info('File written', { path: filePath });
        } catch (error) {
            logger.error('Error writing file', { path: filePath, error: error.message });
            throw error;
        }
    }

    // Delete file
    async delete(filePath) {
        try {
            const key = this.getS3Key(filePath);

            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            await this.s3Client.send(command);
            logger.info('File deleted', { path: filePath });
        } catch (error) {
            logger.error('Error deleting file', { path: filePath, error: error.message });
            throw error;
        }
    }

    // Delete directory (recursively delete all objects with prefix)
    async deleteDirectory(dirPath) {
        try {
            const prefix = this.getS3Key(dirPath);
            const prefixWithSlash = prefix ? prefix + '/' : '';

            // List all objects with this prefix
            const listCommand = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefixWithSlash
            });

            const objects = await this.s3Client.send(listCommand);

            if (!objects.Contents || objects.Contents.length === 0) {
                logger.info('Directory already empty', { path: dirPath });
                return;
            }

            // Delete all objects
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: {
                    Objects: objects.Contents.map(obj => ({ Key: obj.Key }))
                }
            });

            await this.s3Client.send(deleteCommand);
            logger.info('Directory deleted', { path: dirPath, deletedCount: objects.Contents.length });
        } catch (error) {
            logger.error('Error deleting directory', { path: dirPath, error: error.message });
            throw error;
        }
    }

    // Rename/move file
    async rename(oldPath, newPath) {
        try {
            const oldKey = this.getS3Key(oldPath);
            const newKey = this.getS3Key(newPath);

            // Copy to new location
            const copyCommand = new PutObjectCommand({
                Bucket: this.bucket,
                Key: newKey,
                CopySource: `${this.bucket}/${oldKey}`
            });

            await this.s3Client.send(copyCommand);

            // Delete old file
            await this.delete(oldPath);

            logger.info('File renamed', { from: oldPath, to: newPath });
        } catch (error) {
            logger.error('Error renaming file', { from: oldPath, to: newPath, error: error.message });
            throw error;
        }
    }

    // Create directory (in S3, we just ensure the path exists by creating a placeholder)
    async mkdir(dirPath) {
        try {
            const key = this.getS3Key(dirPath);
            const keyWithSlash = key ? key + '/' : '';

            // Create a placeholder object for the directory
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: keyWithSlash,
                Body: ''
            });

            await this.s3Client.send(command);
            logger.info('Directory created', { path: dirPath });
        } catch (error) {
            logger.error('Error creating directory', { path: dirPath, error: error.message });
            throw error;
        }
    }
}

export default S3FileSystem;
