// tokenService.js
const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const router = express.Router();

// Constants from your configuration
const APP_ID = '0d93673aec684720b9126be9fbd575ae';
const APP_CERTIFICATE = '33f9a027a70f48bab96ba233ea13781f';

// Endpoint to generate token
router.post('/generate-token', async (req, res) => {
  try {
    const { channelName } = req.body;
    if (!channelName) {
      return res.status(400).json({ error: 'Channel name required' });
    }

    const appID = '0d93673aec684720b9126be9fbd575ae';
    const appCertificate = '33f9a027a70f48bab96ba233ea13781f';
    const uid = 0;
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appID,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    res.json({ token, channelName });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Token generation failed' });
  }
});
// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router; // Export the router
