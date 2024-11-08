// transcriptionService.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router(); // Use Router to define routes

// Connect to MongoDB
mongoose.connect('mongodb+srv://root:admin@meetingtranscriptiondat.klfp4.mongodb.net/MeetingTranscriptionData', {})
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("Failed to connect to MongoDB", err));

// Define the schema and model for meeting transcription
const meetingTranscriptionSchema = new mongoose.Schema({
  meetingId: String,
  transcriptions: [{
    timestamp: String,
    text: String,
    speaker: String
  }]
});

const MeetingTranscription = mongoose.model('MeetingTranscription', meetingTranscriptionSchema);

// Route to handle transcription updates
router.post('/transcription', async (req, res) => {
  try {
    const { meetingId, transcription } = req.body;

    let meetingTranscription = await MeetingTranscription.findOne({ meetingId });

    if (meetingTranscription) {
      // Push new transcription to array
      meetingTranscription.transcriptions.push({
        timestamp: transcription.timestamp,
        text: transcription.text,
        speaker: transcription.speaker
      });
      await meetingTranscription.save();
    } else {
      // Create new document with initial transcription
      meetingTranscription = await MeetingTranscription.create({
        meetingId,
        transcriptions: [{
          timestamp: transcription.timestamp,
          text: transcription.text,
          speaker: transcription.speaker
        }]
      });
    }

    res.status(200).send("Transcription updated");
  } catch (error) {
    console.error('Error saving transcription:', error);
    res.status(500).send("Error saving transcription");
  }
});

module.exports = router; // Export the router
