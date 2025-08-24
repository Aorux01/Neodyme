const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { Errors, sendError } = require('../src/errors/errors');
const LoggerService = require("../src/utils/logger");

// Load SAC (Support-A-Creator) codes
let supportedCodes = [];

async function loadSACCodes() {
    try {
        const sacPath = path.join(process.cwd(), 'static-content', 'SAC.json');
        const sacData = await fs.readFile(sacPath, 'utf8');
        supportedCodes = JSON.parse(sacData);
    } catch (error) {
        LoggerService.log('error', `Failed to load SAC codes: ${error}`);
    }
}

// Initialize SAC codes
loadSACCodes();

// Get affiliate by slug
router.get('/affiliate/api/public/affiliates/slug/:slug', async (req, res) => {
    try {
        // Reload SAC codes to ensure we have latest data
        await loadSACCodes();
        
        const slug = req.params.slug.toLowerCase();
        
        // Check if code is supported
        const isValidCode = supportedCodes.some(code => 
            code.toLowerCase() === slug
        );
        
        if (isValidCode) {
            // Find the original case version
            const originalCode = supportedCodes.find(code => 
                code.toLowerCase() === slug
            );
            
            res.json({
                id: originalCode,
                slug: originalCode,
                displayName: originalCode,
                status: "ACTIVE",
                verified: false
            });
        } else {
            sendError(res, error);
        }
    } catch (error) {
        LoggerService.log('error', `Error in affiliate lookup: ${error}`);
        sendError(res, error);
    }
});

// Search affiliates
router.get('/affiliate/api/public/affiliates/search', async (req, res) => {
    try {
        await loadSACCodes();
        
        const query = (req.query.q || '').toLowerCase();
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        // Filter codes based on search query
        const filteredCodes = supportedCodes.filter(code => 
            code.toLowerCase().includes(query)
        );
        
        // Apply pagination
        const paginatedCodes = filteredCodes.slice(offset, offset + limit);
        
        const results = paginatedCodes.map(code => ({
            id: code,
            slug: code,
            displayName: code,
            status: "ACTIVE",
            verified: false
        }));
        
        res.json({
            results: results,
            hasMore: offset + limit < filteredCodes.length
        });
    } catch (error) {
        LoggerService.log('error', `Error searching affiliates: ${error}`);
        res.json({
            results: [],
            hasMore: false
        });
    }
});

// Get affiliate by ID
router.get('/affiliate/api/public/affiliates/:affiliateId', async (req, res) => {
    try {
        await loadSACCodes();
        
        const affiliateId = req.params.affiliateId;
        
        // Check if code exists
        const code = supportedCodes.find(c => 
            c === affiliateId || c.toLowerCase() === affiliateId.toLowerCase()
        );
        
        if (code) {
            res.json({
                id: code,
                slug: code,
                displayName: code,
                status: "ACTIVE",
                verified: false,
                supporterCount: Math.floor(Math.random() * 1000),
                metadata: {}
            });
        } else {
            sendError(res, error);
        }
    } catch (error) {
        LoggerService.log('error', `Error getting affiliate: ${error}`);
        sendError(res, error);
    }
});

// Validate affiliate code
router.post('/affiliate/api/public/affiliates/validate', async (req, res) => {
    try {
        await loadSACCodes();
        
        const { slug } = req.body;
        
        if (!slug) {
            sendError(res, error);
        }
        
        const isValid = supportedCodes.some(code => 
            code.toLowerCase() === slug.toLowerCase()
        );
        
        res.json({
            valid: isValid,
            slug: slug,
            reason: isValid ? null : "NOT_FOUND"
        });
    } catch (error) {
        LoggerService.log('error', `Error validating affiliate: ${error}`);
        res.json({
            valid: false,
            slug: req.body.slug,
            reason: "ERROR"
        });
    }
});

module.exports = router;