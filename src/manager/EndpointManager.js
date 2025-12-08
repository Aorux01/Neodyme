const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const LoggerService = require('../service/logger/LoggerService');
const ConfigManager = require('./ConfigManager');
const {ApiError, sendError, Errors} = require('../service/error/Errors');
const RateLimitManager = require('./RateLimitManager');
const { globalRateLimit } = require('../middleware/rateLimitMiddleware');

class EndpointManager {
    static app = null;
    static requestCount = 0;

    static async start() {
        this.app = express();
        await this.initializeRateLimiting();
        this.setupMiddleware();
        await this.loadEndpoints();
        this.setupErrorHandling();

        LoggerService.log('success', 'API server is initialized.');

        return this.app;
    }

    static async initializeRateLimiting() {
        try {
            await RateLimitManager.initialize();
        } catch (error) {
            LoggerService.log('error', `Failed to initialize rate limiting: ${error.message}`);
        }
    }

    static setupMiddleware() {
        try {
            // Trust proxy if enabled (important for rate limiting behind reverse proxy)
            if (ConfigManager.get('trustProxy', true)) {
                this.app.set('trust proxy', true);
            }

            // Helmet security headers
            if (ConfigManager.get('helmetEnable', true)) {
                this.app.use(helmet({
                    crossOriginEmbedderPolicy: false,
                    contentSecurityPolicy: false
                }));
            }

            // CORS
            if (ConfigManager.get('corsEnable', true)) {
                this.app.use(cors({
                    origin: true,
                    credentials: true,
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                    allowedHeaders: ['Content-Type', 'Authorization', 'X-Epic-Correlation-ID', 'X-Requested-With']
                }));
            }

            // Compression
            if (ConfigManager.get('compressionEnable', true)) {
                this.app.use(compression());
            }

            // Body size limit
            const limit_raw = ConfigManager.get('limitBodySize', '50mb');
            this.app.use('/fortnite/api/cloudstorage/user/*/*', express.raw({
                limit: limit_raw,
                type: '*/*'
            }));

            this.app.use(express.json({ limit: limit_raw }));
            this.app.use(express.urlencoded({ extended: true, limit: limit_raw }));
            this.app.use('/images', express.static(path.join(__dirname, '../../public/images')));
            this.app.use(cookieParser());

            // Request tracking
            this.app.use((req, res, next) => {
                req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                req.startTime = performance.now();
                this.requestCount++;
                next();
            });

            // Global rate limiter - Applied to all requests
            if (ConfigManager.get('rateLimiting', true)) {
                this.app.use(globalRateLimit());
                LoggerService.log('info', 'Global rate limiting enabled');
            }
    
            if (ConfigManager.get('debug')) {
                this.app.use((req, res, next) => {
                    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                    
                    if (ConfigManager.get('debugIps')) {
                        LoggerService.log('debug', `Incoming request from ${clientIp}`);
                    }
            
                    if (ConfigManager.get('debugRequests')) {
                        LoggerService.log('debug', `Request: ${req.method} ${req.url}`, {
                            headers: req.headers,
                            body: req.body,
                            query: req.query
                        });
                    }
            
                    if (ConfigManager.get('debugResponses')) {
                        const originalSend = res.send;
                        res.send = function(data) {
                            LoggerService.log('debug', `Response: ${res.statusCode}`, {
                                headers: res.getHeaders(),
                                body: data
                            });
                            originalSend.call(res, data);
                        };
                    }
            
                    next();
                });
            }
            
            if (ConfigManager.get('debug')) {
                this.app.use(morgan('dev', {
                    stream: {
                        write: (message) => {
                            LoggerService.log('debug', message.trim());
                        }
                    }
                }));
            }
    
            this.app.use('/favicon.ico', (req, res) => {
                const faviconPath = path.join(__dirname, '..', '..', 'public', 'images', 'neodyme-public-service', 'favicon.ico');
                if (fs.existsSync(faviconPath)) {
                    res.sendFile(faviconPath);
                } else {
                    res.status(204).end();
                }
            });
    
            if (ConfigManager.get('webInterface') !== false) {
                const webDir = path.join(__dirname, '..', '..', 'web');
                
                if (!fs.existsSync(webDir)) {
                    fs.mkdirSync(webDir, { recursive: true });
                    LoggerService.log('info', `Created web directory at ${webDir}`);
                }
                
                this.app.use('/', express.static(webDir));
                
                this.app.get('/', (req, res) => {
                    const indexPath = path.join(webDir, 'index.html');
                    if (fs.existsSync(indexPath)) {
                        res.sendFile(indexPath);
                    } else {
                        res.status(404).send('Web interface not found');
                    }
                });
        
                //LoggerService.log('info', `Web interface enabled at http://localhost:${ConfigManager.get('port')}/`);
            }
        } catch (error) {
            LoggerService.log('error', `Failed to set up middleware: ${error.message}`);
        }
    }

    static async loadEndpoints() {
        const endpointsDir = path.join(__dirname, '..', '..', 'api');
        
        try {
            if (!fs.existsSync(endpointsDir)) {
                LoggerService.log('warn', 'API directory does not exist. Creating it...');
                fs.mkdirSync(endpointsDir, { recursive: true });
                LoggerService.log('warn', 'API directory created, no endpoints loaded');
                return;
            }
    
            this.loadEndpointsRecursive(endpointsDir, endpointsDir);
            
        } catch (error) {
            LoggerService.log('error', `Failed to load endpoints: ${error.message}`);
        }
    }

    static loadEndpointsRecursive(currentDir, baseDir) {
        const files = fs.readdirSync(currentDir);
        
        files.forEach(file => {
            const filePath = path.join(currentDir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                this.loadEndpointsRecursive(filePath, baseDir);
            }
            else if (file.endsWith('.js')) {
                const relativePath = path.relative(baseDir, filePath);
                try {
                    const route = require(filePath);
                    
                    if (typeof route === 'function' || (route && route.router)) {
                        this.app.use('/', route);
                        
                        LoggerService.log('success', `Loaded route: ${relativePath}`);
                    } else {
                        LoggerService.log('warn', `Invalid route format: ${relativePath}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to load route ${relativePath}: ${error.message}`);
                }
            }
        });
    }

    static setupErrorHandling() {
        this.app.use((req, res, next) => {
            const error = Errors.Basic.notFound();
            sendError(res, error);
        });

        this.app.use((err, req, res, next) => {
            const endTime = performance.now();
            const duration = Math.round(endTime - req.startTime);
            
            LoggerService.log('error', `Request ${req.requestId} failed after ${duration}ms`, {
                error: err.message,
                stack: ConfigManager.get('debug') ? err.stack : undefined
            });

            if (err instanceof ApiError) {
                sendError(res, err);
            } else {
                const error = Errors.Internal.serverError();
                sendError(res, error);
            }
        });

        this.app.use((req, res, next) => {
            res.on('finish', () => {
                const endTime = performance.now();
                const duration = Math.round(endTime - req.startTime);
                
                if (ConfigManager.get('debug')) {
                    LoggerService.log('debug', `Request ${req.requestId} completed in ${duration}ms`);
                }
            });
            next();
        });
    }
}

module.exports = EndpointManager;

