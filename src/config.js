import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const required = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'S3_BUCKET',
  'FTP_USER',
  'FTP_PASSWORD'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    bucket: process.env.S3_BUCKET
  },
  ftp: {
    port: parseInt(process.env.FTP_PORT || '21', 10),
    pasv_min: parseInt(process.env.PASV_MIN_PORT || '30000', 10),
    pasv_max: parseInt(process.env.PASV_MAX_PORT || '30100', 10),
    pasv_url: process.env.PASV_URL || process.env.SERVER_URL,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD
  },
  server: {
    url: process.env.SERVER_URL || 'localhost',
    healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT || '3000', 10)
  }
};
