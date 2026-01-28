# S3 FTP Server

A production-ready FTP server that uses AWS S3 as backend storage, built with Node.js and containerized with Docker.

## Features

- 🚀 **S3 Backend**: All files stored in AWS S3 bucket
- 🔒 **Secure**: FTPS support with authentication
- 🐳 **Docker Ready**: Fully containerized with Docker support
- 📊 **Health Checks**: Built-in health monitoring endpoint
- 📝 **Logging**: Comprehensive logging with Winston
- 🔄 **Graceful Shutdown**: Proper cleanup on termination
- 🌐 **Passive Mode**: Configurable passive port range

## Prerequisites

- Node.js 18+ or Docker
- AWS Account with S3 access
- AWS IAM user with S3 permissions

## AWS S3 Setup

### 1. Create S3 Bucket

```bash
aws s3 mb s3://your-ftp-bucket-name --region us-east-1
```

### 2. Create IAM User

Create an IAM user with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::your-ftp-bucket-name"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-ftp-bucket-name/*"
    }
  ]
}
```

### 3. Get Access Keys

Save the AWS Access Key ID and Secret Access Key for configuration.

## Quick Start

### Option 1: Using Docker (Recommended)

1. **Clone and setup:**
   ```bash
   cd d:/github/s3Ftp
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials and FTP settings
   ```

3. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

4. **View logs:**
   ```bash
   docker-compose logs -f
   ```

### Option 2: Using Node.js

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start server:**
   ```bash
   npm start
   ```

## Configuration

Edit `.env` file with your settings:

```env
# AWS Credentials
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name

# FTP Configuration
FTP_USER=ftpuser
FTP_PASSWORD=secure_password
FTP_PORT=21
PASV_MIN_PORT=30000
PASV_MAX_PORT=30100
PASV_URL=your-server-domain.com  # Use localhost for local testing

# Optional
HEALTH_CHECK_PORT=3000
LOG_LEVEL=info
```

## Connecting with FTP Client

### FileZilla

1. Host: `your-server-domain.com` (or `localhost` for local)
2. Username: Value from `FTP_USER`
3. Password: Value from `FTP_PASSWORD`
4. Port: `21`

### Command Line

```bash
ftp your-server-domain.com
# Enter username and password when prompted
```

### Using lftp

```bash
lftp -u ftpuser,your_password your-server-domain.com
```

## Deployment

### ⚠️ Important: Vercel Not Supported

**Vercel cannot host FTP servers** because:
- FTP requires persistent TCP connections
- Multiple ports needed (control + data ports)
- Long-running processes not supported

### Recommended Platforms

#### 1. Railway (Easiest)

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and initialize:**
   ```bash
   railway login
   railway init
   ```

3. **Add environment variables:**
   ```bash
   railway variables set AWS_ACCESS_KEY_ID=your_key
   railway variables set AWS_SECRET_ACCESS_KEY=your_secret
   railway variables set AWS_REGION=us-east-1
   railway variables set S3_BUCKET=your-bucket
   railway variables set FTP_USER=ftpuser
   railway variables set FTP_PASSWORD=secure_password
   railway variables set PASV_URL=your-railway-domain.up.railway.app
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

5. **Expose FTP ports in Railway dashboard:**
   - Go to your service settings
   - Add public TCP proxy for port 21
   - Note the assigned domain

#### 2. Render

1. **Create new Web Service:**
   - Connect your GitHub repository
   - Select "Docker" as environment
   - Set environment variables in dashboard

2. **Configure:**
   - Set `PASV_URL` to your Render service URL
   - Ensure ports 21 and 30000-30100 are exposed

#### 3. DigitalOcean App Platform

1. **Create new app:**
   ```bash
   doctl apps create --spec .do/app.yaml
   ```

2. **Set environment variables in DO dashboard**

#### 4. AWS ECS (Production)

1. **Build and push image:**
   ```bash
   docker build -t s3-ftp-server .
   docker tag s3-ftp-server:latest YOUR_ECR_REPO/s3-ftp-server:latest
   docker push YOUR_ECR_REPO/s3-ftp-server:latest
   ```

2. **Create ECS task definition and service**
3. **Configure Application Load Balancer for FTP**

#### 5. VPS (Full Control)

**DigitalOcean/Linode/Vultr:**

```bash
# SSH into your VPS
ssh user@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Clone your repository
git clone your-repo-url
cd s3Ftp

# Configure environment
cp .env.example .env
nano .env  # Edit with your settings

# Run with Docker Compose
docker-compose up -d
```

## Health Check

The server exposes a health check endpoint:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "service": "s3-ftp-server",
  "timestamp": "2026-01-27T14:30:00.000Z"
}
```

## File Operations

All standard FTP operations are supported:

- **LIST**: List files and directories
- **RETR**: Download files from S3
- **STOR**: Upload files to S3
- **DELE**: Delete files from S3
- **MKD**: Create directories (S3 prefixes)
- **RMD**: Remove directories
- **RNFR/RNTO**: Rename/move files

## Troubleshooting

### Connection Refused

- Ensure FTP server is running: `docker-compose logs`
- Check firewall allows port 21 and passive ports
- Verify `PASV_URL` is set correctly

### Passive Mode Issues

- Set `PASV_URL` to your server's public IP or domain
- Ensure passive port range (30000-30100) is open in firewall
- Some corporate networks block passive FTP

### AWS Credentials Error

- Verify AWS credentials are correct
- Check IAM user has S3 permissions
- Ensure S3 bucket exists and region is correct

### Can't See Files

- Check S3 bucket name is correct
- Verify IAM permissions include `s3:ListBucket`
- Files are stored with their full path as S3 key

### Socket Not Writable Error

This error typically occurs when a client disconnects during a transfer:

- **Normal behavior**: Client cancels transfer or network interruption
- **How we handle it**: Error is logged at DEBUG level, not ERROR
- **When to worry**: If it happens on every connection

For detailed troubleshooting, see **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**

## Security Recommendations

1. **Use FTPS**: Enable TLS/SSL for encrypted connections
2. **Strong Passwords**: Use complex FTP passwords
3. **Restrict Access**: Use security groups/firewall rules
4. **S3 Bucket Policy**: Restrict bucket access to specific IAM user
5. **VPC**: Deploy in private VPC when possible
6. **Monitor Logs**: Review logs regularly for suspicious activity

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ FTP Client  │ ◄─────► │ FTP Server   │ ◄─────► │   AWS S3    │
│ (FileZilla) │  FTP    │ (Node.js)    │  S3 API │   Bucket    │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │   Winston    │
                        │   Logging    │
                        └──────────────┘
```

## License

MIT

## Support

For issues and questions, please create an issue in the repository.
