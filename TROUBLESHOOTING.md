# Troubleshooting: Socket Not Writable Error

## Error Overview

**Error Message:** `Satisfy Parameters Error { error: 'Socket not writable' }`

**Log Level:** 50 (ERROR)

**Source:** `ftp-srv` library

## What This Error Means

The "Socket not writable" error occurs when the FTP server attempts to write data to a client connection that has already been closed or is not in a state to receive data. This is typically a client-side disconnection issue rather than a server bug.

## Common Causes

### 1. **Client Disconnection During Transfer**
- Client closed the connection prematurely
- Network interruption between client and server
- Client timeout due to slow S3 operations

### 2. **Passive Mode Connection Issues**
- Firewall blocking passive data ports (30000-30100)
- Incorrect `PASV_URL` configuration
- NAT/routing issues in containerized environments

### 3. **Timeout Issues**
- Client timeout waiting for S3 operations
- Network timeout during large file transfers
- Connection idle timeout

### 4. **Resource Constraints**
- Server running out of file descriptors
- Memory pressure causing connection drops
- Too many concurrent connections

## Solutions Implemented

### ✅ 1. Enhanced Error Handling
- Added error handlers to all read/write streams
- Gracefully handle socket closure errors
- Convert ERROR level logs to DEBUG for expected disconnections

### ✅ 2. Connection Timeout Configuration
```javascript
timeout: 30000 // 30 second timeout
```

### ✅ 3. Stream Error Listeners
All streams now have error handlers to prevent crashes:
```javascript
stream.on('error', (error) => {
    logger.error('Stream error', { path: filePath, error: error.message });
});
```

### ✅ 4. Better Client Error Handling
Socket-related errors are now logged at DEBUG level instead of ERROR:
```javascript
if (error.message && error.message.includes('Socket not writable')) {
    logger.debug('Client socket closed during operation', {
        ip: connection.ip,
        context
    });
}
```

## Prevention Strategies

### For Development

1. **Use Stable Network Connection**
   - Avoid WiFi when testing large transfers
   - Use localhost/127.0.0.1 for local testing

2. **Configure FTP Client Settings**
   - Increase client timeout settings
   - Use passive mode
   - Limit concurrent connections

3. **Monitor Logs**
   ```bash
   docker-compose logs -f
   # Look for patterns of disconnections
   ```

### For Production

1. **Firewall Configuration**
   ```bash
   # Allow FTP control port
   ufw allow 21/tcp
   
   # Allow passive port range
   ufw allow 30000:30100/tcp
   ```

2. **Environment Variables**
   ```env
   # Set to your public domain/IP
   PASV_URL=your-server-domain.com
   
   # Or for Railway/Render
   PASV_URL=${RAILWAY_STATIC_URL}
   ```

3. **Health Monitoring**
   ```bash
   # Regular health checks
   curl http://your-server:3000/health
   ```

4. **Resource Limits**
   ```yaml
   # docker-compose.yml
   deploy:
     resources:
       limits:
         cpus: '1'
         memory: 512M
       reservations:
         cpus: '0.5'
         memory: 256M
   ```

## Debugging Steps

### Step 1: Check Logs
```bash
# View recent logs
docker-compose logs --tail=100 s3-ftp-server

# Follow logs in real-time
docker-compose logs -f
```

### Step 2: Test Connection
```bash
# Test FTP connection
ftp localhost
# Enter username and password

# Test passive mode
ftp> passive
ftp> ls
```

### Step 3: Verify Configuration
```bash
# Check environment variables
cat .env

# Verify ports are exposed
docker ps
```

### Step 4: Network Diagnostics
```bash
# Check if ports are listening
netstat -tuln | grep -E '21|30000'

# Test connectivity
telnet your-server-domain.com 21
```

## Client-Specific Fixes

### FileZilla
1. Edit → Settings → Connection → Timeout: **60 seconds**
2. Transfer Settings → Limit simultaneous connections: **2**
3. Connection → FTP → Transfer mode: **Passive**

### WinSCP
1. Session → Connection → Timeout: **60 seconds**
2. Connection → Passive mode: **On**

### Command Line FTP
```bash
# Set timeout
ftp -v -i your-server.com
ftp> set timeout 60
```

## When to Worry

### ✅ Don't Worry If:
- Error occurs occasionally (client disconnections are normal)
- Happens when client explicitly cancels transfer
- Client reconnects successfully afterward

### ⚠️ Investigate If:
- Error occurs on every connection attempt
- Multiple clients experience the same issue
- Error causes server crash or restart
- Pattern of errors at specific times/operations

## Log Level Configuration

To reduce log noise from normal client disconnections:

```env
# .env file
LOG_LEVEL=info  # Use 'debug' for detailed troubleshooting
```

## Additional Resources

- [ftp-srv Documentation](https://github.com/trs/ftp-srv)
- [AWS S3 Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)
- [FTP Passive Mode Explained](https://slacksite.com/other/ftp.html)

## Getting Help

If the error persists after implementing these fixes:

1. Capture full logs during the error:
   ```bash
   docker-compose logs --tail=500 > error-logs.txt
   ```

2. Check your environment:
   - Node.js version: `node --version`
   - Docker version: `docker --version`
   - Network configuration

3. Create an issue with:
   - Error logs
   - Environment details
   - Steps to reproduce
