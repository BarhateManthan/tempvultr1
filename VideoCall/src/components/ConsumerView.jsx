import React, { useState, useEffect } from 'react';
import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Mic, PhoneOff } from 'lucide-react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Alert, AlertDescription } from './Alert';
import './ConsumerView.css';

const ConsumerView = () => {
  const { channelName, token, meetingId } = useParams();
  const navigate = useNavigate();
  const APP_ID = '0d93673aec684720b9126be9fbd575ae';

  const [localTracks, setLocalTracks] = useState([]);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [error, setError] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [connectionState, setConnectionState] = useState('DISCONNECTED');
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isJoining, setIsJoining] = useState(true);
  const [debugLog, setDebugLog] = useState([]);
  
  // Create refs for both the client and tracks to ensure persistence across renders
  const clientRef = useRef(null);
  const localTracksRef = useRef([]);

  const addDebugLog = (message) => {
    console.log(`[Consumer Debug] ${message}`);
    setDebugLog(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  const handleUserJoined = async (user, mediaType) => {
    addDebugLog(`Remote user ${user.uid} joined with ${mediaType}`);
    try {
      // Always use clientRef.current instead of checking state
      if (!clientRef.current) {
        throw new Error('Client not initialized');
      }

      await clientRef.current.subscribe(user, mediaType);
      addDebugLog(`Subscribed to ${mediaType} from user ${user.uid}`);

      if (mediaType === 'video') {
        const remotePlayer = document.getElementById('remote-video-container');
        if (remotePlayer) {
          user.videoTrack.play(remotePlayer);
          addDebugLog(`Playing remote video from user ${user.uid}`);
        }
      }

      if (mediaType === 'audio') {
        user.audioTrack.play();
        addDebugLog(`Playing remote audio from user ${user.uid}`);
      }

      setRemoteUsers(prev => ({ ...prev, [user.uid]: user }));
    } catch (error) {
      addDebugLog(`Error handling user joined: ${error.message}`);
      if (clientRef.current) {
        // Retry subscription after a delay
        setTimeout(() => handleUserJoined(user, mediaType), 1000);
      }
    }
  };

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      setHasPermissions(true);
      return true;
    } catch (error) {
      console.error('Permission check failed:', error);
      setError('Please grant camera and microphone permissions to join the meeting');
      setHasPermissions(false);
      return false;
    }
  };

  const joinChannel = async (agoraClient) => {
    try {
      addDebugLog('Starting consumer join process...');
      
      const consumerUid = 2000 + Math.floor(Math.random() * 1000);
      addDebugLog(`Joining with consumer UID: ${consumerUid}`);

      await agoraClient.join(APP_ID, channelName, token, consumerUid);
      addDebugLog('Successfully joined channel');

      addDebugLog('Creating local tracks...');
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTracksRef.current = [audioTrack, videoTrack];
      setLocalTracks([audioTrack, videoTrack]);
      addDebugLog('Local tracks created');

      const localPlayer = document.getElementById('local-video-container');
      if (localPlayer && videoTrack) {
        videoTrack.play(localPlayer);
        addDebugLog('Local video playing');
      }

      addDebugLog('Publishing tracks...');
      await agoraClient.publish([audioTrack, videoTrack]);
      addDebugLog('Tracks published successfully');

      // Handle existing users after successful join
      setTimeout(() => {
        const remoteUsers = agoraClient.remoteUsers;
        addDebugLog(`Found ${remoteUsers.length} existing users`);
        
        remoteUsers.forEach(user => {
          if (user.uid === 1000) {
            addDebugLog('Found host in channel');
            if (user.hasVideo) handleUserJoined(user, 'video');
            if (user.hasAudio) handleUserJoined(user, 'audio');
          }
        });
      }, 1000);

      setConnectionState('CONNECTED');
      setError(null);
      setIsJoining(false);

      return consumerUid;
    } catch (error) {
      addDebugLog(`Error in joinChannel: ${error.message}`);
      throw error;
    }
  };

  useEffect(() => {
    const initializeAgoraClient = async () => {
      try {
        setIsJoining(true);
        
        if (!channelName || !token || !meetingId) {
          throw new Error('Invalid meeting parameters');
        }

        const permitted = await checkPermissions();
        if (!permitted) return;

        // Initialize client only if it hasn't been initialized
        if (!clientRef.current) {
          const agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
          clientRef.current = agoraClient;

          // Set up event listeners
          agoraClient.on('user-published', handleUserJoined);
          agoraClient.on('user-left', handleUserLeft);
          
          agoraClient.on('connection-state-change', (curState, prevState) => {
            console.log(`Connection state changed from ${prevState} to ${curState}`);
            setConnectionState(curState);
            
            if (curState === 'DISCONNECTED') {
              setError('Connection lost. Please try rejoining the meeting.');
              leaveAndRemoveLocalStream();
            }
          });

          agoraClient.on('error', (err) => {
            console.error('Agora client error:', err);
            setError(`Connection error: ${err.message}`);
          });

          await joinChannel(agoraClient);
        }
        
        setIsJoining(false);
      } catch (error) {
        console.error('Failed to initialize Agora client:', error);
        setError('Failed to join the meeting. Please try again.');
        setIsJoining(false);
      }
    };

    initializeAgoraClient();

    return () => {
      leaveAndRemoveLocalStream();
    };
  }, [channelName, token, meetingId]);

  const handleUserLeft = (user) => {
    setRemoteUsers(prev => {
      const updated = { ...prev };
      delete updated[user.uid];
      return updated;
    });
  };

  const leaveAndRemoveLocalStream = async () => {
    try {
      // Use localTracksRef instead of state
      if (localTracksRef.current.length > 0) {
        localTracksRef.current.forEach(track => {
          track.stop();
          track.close();
        });
        localTracksRef.current = [];
      }

      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }

      setLocalTracks([]);
      setRemoteUsers({});
      navigate('/');
    } catch (error) {
      console.error('Error leaving channel:', error);
    }
  };

  const toggleMic = async () => {
    if (localTracksRef.current[0]) {
      await localTracksRef.current[0].setEnabled(!isMicOn);
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = async () => {
    if (localTracksRef.current[1]) {
      await localTracksRef.current[1].setEnabled(!isCameraOn);
      setIsCameraOn(!isCameraOn);
    }
  };

  if (error) {
    return (
      <div className="consumer-error">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <button 
          onClick={() => navigate('/')}
          className="back-button"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="consumer-view">
      {error ? (
        <div className="consumer-error">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <button 
            onClick={() => navigate('/')}
            className="back-button"
          >
            Back to Home
          </button>
        </div>
      ) : (
        <>
          <div className="meeting-info">
            <h1 className="meeting-title">Video Meeting</h1>
            <p className="meeting-id">Meeting ID: {meetingId}</p>
            {connectionState !== 'CONNECTED' && (
              <div className="connecting-status">
                Connecting to meeting...
              </div>
            )}
          </div>

          <div className="video-grid">
            <div className="video-container main">
              <div id="remote-video-container" className="video-frame">
                {Object.keys(remoteUsers).length === 0 && 'Waiting for host...'}
              </div>
            </div>
            <div className="video-container secondary">
              <div id="local-video-container" className="video-frame">
                {!localTracks.length && 'Your Video'}
              </div>
            </div>
          </div>

          <div className="controls-bar">
            <button
              onClick={toggleCamera}
              disabled={!localTracks.length}
              className={`control-button camera ${!isCameraOn ? 'off' : ''}`}
            >
              <Camera size={24} />
            </button>
            <button
              onClick={toggleMic}
              disabled={!localTracks.length}
              className={`control-button mic ${!isMicOn ? 'off' : ''}`}
            >
              <Mic size={24} />
            </button>
            <button
              onClick={leaveAndRemoveLocalStream}
              className="control-button end-call"
            >
              <PhoneOff size={24} />
            </button>
          </div>
        </>
      )}

      {process.env.NODE_ENV === 'development' && (
        <div className="debug-log" style={{ 
          position: 'fixed', 
          bottom: 0, 
          right: 0, 
          maxWidth: '300px',
          maxHeight: '200px',
          overflow: 'auto',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          fontSize: '12px'
        }}>
          {debugLog.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConsumerView;