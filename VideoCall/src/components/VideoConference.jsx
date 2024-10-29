import React, { useState, useEffect } from 'react';
import { useRef } from 'react';
import { Camera, Mic, PhoneOff, Send, Timer, Copy, Check } from 'lucide-react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Alert, AlertDescription } from './Alert';
import './VideoConference.css';

const VideoConference = () => {
  const APP_ID = '0d93673aec684720b9126be9fbd575ae';
  const CHANNEL_PREFIX = 'meeting_';
  const consumers = [
    { name: "Soham Mhatre", email: "ichbinsoham@gmail.com" },
    { name: "John Doe", email: "john.doe@example.com" },
    { name: "Jane Smith", email: "jane.smith@example.com" },
    { name: "Alex Johnson", email: "alex.j@example.com" },
    { name: "Sarah Wilson", email: "sarah.w@example.com" }
  ];

  const [showAlert, setShowAlert] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [cooldowns, setCooldowns] = useState({});
  const [localTracks, setLocalTracks] = useState([]);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [client, setClient] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [copied, setCopied] = useState(false);
  const [connectionState, setConnectionState] = useState('DISCONNECTED');
  const [error, setError] = useState(null);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const clientRef = useRef(null);
  const handleUserJoined = async (user, mediaType) => {
    addDebugLog(`Remote user ${user.uid} joined with ${mediaType}`);
    try {
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
      // Retry subscription after a short delay
      setTimeout(() => {
        if (clientRef.current) {
          handleUserJoined(user, mediaType);
        }
      }, 1000);
    }
  };

  useEffect(() => {
    const initializeAgoraClient = async () => {
      try {
        const permitted = await checkPermissions();
        if (!permitted) return;

        const agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = agoraClient;
        
        agoraClient.on('connection-state-change', (curState, prevState) => {
          console.log(`Connection state changed from ${prevState} to ${curState}`);
          setConnectionState(curState);
          
          if (curState === 'DISCONNECTED') {
            setError('Connection lost. Please try rejoining the call.');
            leaveAndRemoveLocalStream();
          }
        });

        agoraClient.on('error', (err) => {
          console.error('Agora client error:', err);
          setError(`Connection error: ${err.message}`);
        });

        agoraClient.on('user-published', handleUserJoined);
        agoraClient.on('user-left', handleUserLeft);
        
        setClient(agoraClient);
      } catch (error) {
        console.error('Failed to initialize Agora client:', error);
        setError('Failed to initialize video conference system');
      }
    };

    initializeAgoraClient();

    return () => {
      if (clientRef.current) {
        leaveAndRemoveLocalStream();
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }
    };
  }, []);

  const addDebugLog = (message) => {
    console.log(`[Host Debug] ${message}`);
    setDebugLog(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      setHasPermissions(true);
      return true;
    } catch (error) {
      console.error('Permission check failed:', error);
      setError('Please grant camera and microphone permissions to start a meeting');
      setHasPermissions(false);
      return false;
    }
  };


  // Start cooldown timer effect
  useEffect(() => {
    const timers = {};
    
    Object.keys(cooldowns).forEach(email => {
      if (cooldowns[email] > 0) {
        timers[email] = setInterval(() => {
          setCooldowns(prev => ({
            ...prev,
            [email]: Math.max(0, prev[email] - 1)
          }));
        }, 1000);
      }
    });

    return () => {
      Object.values(timers).forEach(timer => clearInterval(timer));
    };
  }, [cooldowns]);

  const generateAgoraToken = async (channelName, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('http://localhost:5000/api/generate-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channelName,
            role: 'publisher',
            appId: APP_ID,
            appCertificate: '33f9a027a70f48bab96ba233ea13781f',
            uid: 0,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const { token } = await response.json();
        return token;
      } catch (error) {
        console.error(`Token generation attempt ${i + 1} failed:`, error);
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const generateMeetingLink = async (email) => {
    try {
      if (activeCall) {
        await leaveAndRemoveLocalStream();
      }

      // Create channel name
      const channelName = `${CHANNEL_PREFIX}${Date.now()}`;
      addDebugLog(`Generating meeting for channel: ${channelName}`);

      // Generate token
      const token = await generateAgoraToken(channelName);
      addDebugLog('Token generated successfully');

      const meetingId = Math.random().toString(36).substring(7);
      
      // Create meeting link
      const fullUrl = `${window.location.origin}/join/${channelName}/${token}/${meetingId}`;
      
      setSelectedEmail(email);
      setMeetingLink(fullUrl);
      setShowAlert(true);
      
      addDebugLog('Attempting to join channel as host...');
      await joinChannel(channelName, token);  // Pass both parameters here
      
      setActiveCall({ channelName, token, meetingId });

      setCooldowns(prev => ({
        ...prev,
        [email]: 5
      }));

    } catch (error) {
      addDebugLog(`Error generating meeting: ${error.message}`);
      setError('Failed to generate meeting. Please try again.');
      setActiveCall(null);
    }
  };

  const joinChannel = async (channelName, token) => {
    try {
      addDebugLog('Starting join channel process...');
      
      if (!clientRef.current) {
        throw new Error('Agora client not initialized');
      }

      const hostUid = 1000;
      addDebugLog(`Joining channel ${channelName} as host with UID ${hostUid}`);
      await clientRef.current.join(APP_ID, channelName, token, hostUid);
      addDebugLog('Successfully joined channel');

      addDebugLog('Creating audio and video tracks...');
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      
      setLocalTracks([audioTrack, videoTrack]);
      addDebugLog('Local tracks created');

      const localPlayer = document.getElementById('local-video-container');
      if (localPlayer && videoTrack) {
        videoTrack.play(localPlayer);
        addDebugLog('Local video playing');
      }

      addDebugLog('Publishing tracks to channel...');
      await clientRef.current.publish([audioTrack, videoTrack]);
      addDebugLog('Tracks published successfully');

      setConnectionState('CONNECTED');
      setError(null);
      
      return hostUid;
    } catch (error) {
      addDebugLog(`Error in joinChannel: ${error.message}`);
      throw error;
    }
  };



  const handleUserLeft = (user) => {
    setRemoteUsers(prev => {
      const updated = { ...prev };
      delete updated[user.uid];
      return updated;
    });
  };

  const leaveAndRemoveLocalStream = async () => {
    try {
      if (localTracks.length > 0) {
        localTracks.forEach(track => {
          track.stop();
          track.close();
        });
      }

      if (client) {
        await client.leave();
      }

      setLocalTracks([]);
      setRemoteUsers({});
      setActiveCall(null);
    } catch (error) {
      console.error('Error leaving channel:', error);
    }
  };

  const toggleMic = async () => {
    if (localTracks[0]) {
      await localTracks[0].setEnabled(!isMicOn);
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = async () => {
    if (localTracks[1]) {
      await localTracks[1].setEnabled(!isCameraOn);
      setIsCameraOn(!isCameraOn);
    }
  };

  return (
    <div className="video-conference">
      {/* Consumers List Section */}
      <div className="consumers-section">
        <h2 className="consumers-title">Consumers</h2>
        <div>
          {consumers.map((consumer) => (
            <div key={consumer.email} className="consumer-card">
              <h3 className="consumer-name">{consumer.name}</h3>
              <p className="consumer-email">{consumer.email}</p>
              <div className="consumer-actions">
                <button
                  onClick={() => generateMeetingLink(consumer.email)}
                  disabled={cooldowns[consumer.email] > 0 || activeCall}
                  className="invite-button"
                >
                  {cooldowns[consumer.email] > 0 ? (
                    <>
                      <Timer size={16} />
                      {cooldowns[consumer.email]}s
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      {activeCall ? 'In Call' : 'Invite'}
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Video Section */}
      <div className="video-section">
        <div className="video-container">
          <div id="local-video-container" className="video-frame">
            {!localTracks.length && 'Your Video'}
          </div>
        </div>
        <div className="video-container">
          <div id="remote-video-container" className="video-frame">
            {Object.keys(remoteUsers).length === 0 && 'Consumer Video'}
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="controls-section">
        <div className="flex-1">
          {activeCall && (
            <div className="active-call-info">
              <h3 className="active-call-title">Active Call</h3>
              <p className="active-call-channel">Channel: {activeCall.channelName}</p>
            </div>
          )}
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="controls-buttons">
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
            disabled={!activeCall}
            className="control-button end-call"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>

      {/* Meeting Link Alert */}
      {showAlert && (
        <div className="meeting-link-alert">
          <div className="meeting-link-header">
            <h3 className="meeting-link-title">Meeting Link</h3>
            <button 
              onClick={() => setShowAlert(false)}
              className="close-button"
            >
              ×
            </button>
          </div>
          <p className="meeting-link-content">Meeting link generated for {selectedEmail}:</p>
          <div className="meeting-link-url">
            {meetingLink}
          </div>
          <button
            onClick={() => copyToClipboard(meetingLink)}
            className="copy-button"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
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


export default VideoConference;