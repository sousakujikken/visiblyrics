import React, { useState, useEffect } from 'react';
import { useElectronAPI } from '../shared/electronAPI';
import { electronFileManager } from './services/ElectronFileManager';
import { electronMediaManager } from './services/ElectronMediaManager';

export const ElectronTest: React.FC = () => {
  const { isElectron, electronAPI } = useElectronAPI();
  const [appVersion, setAppVersion] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [testResults, setTestResults] = useState<string[]>([]);
  const [projectData, setProjectData] = useState<any>(null);
  const [loadedVideo, setLoadedVideo] = useState<HTMLVideoElement | null>(null);
  const [loadedAudio, setLoadedAudio] = useState<HTMLAudioElement | null>(null);
  
  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };
  
  useEffect(() => {
    if (electronAPI) {
      electronAPI.getAppVersion()
        .then(version => {
          setAppVersion(version);
          addTestResult(`✅ App version retrieved: ${version}`);
        })
        .catch(err => addTestResult(`❌ Failed to get app version: ${err.message}`));
    }
  }, [electronAPI]);
  
  const handleSelectVideo = async () => {
    addTestResult('🔄 Testing video file selection...');
    try {
      const mediaInfo = await electronFileManager.selectVideoFile();
      const fileInfo = `Video: ${mediaInfo.name} (${Math.round(mediaInfo.size / 1024 / 1024)}MB)`;
      setSelectedFile(fileInfo);
      addTestResult(`✅ Video file selected: ${mediaInfo.name}`);
    } catch (error: any) {
      const errorMsg = `❌ Video selection failed: ${error.message}`;
      setSelectedFile(errorMsg);
      addTestResult(errorMsg);
    }
  };
  
  const handleSelectAudio = async () => {
    addTestResult('🔄 Testing audio file selection...');
    try {
      const mediaInfo = await electronFileManager.selectAudioFile();
      const fileInfo = `Audio: ${mediaInfo.name} (${Math.round(mediaInfo.size / 1024 / 1024)}MB)`;
      setSelectedFile(fileInfo);
      addTestResult(`✅ Audio file selected: ${mediaInfo.name}`);
    } catch (error: any) {
      const errorMsg = `❌ Audio selection failed: ${error.message}`;
      setSelectedFile(errorMsg);
      addTestResult(errorMsg);
    }
  };
  
  const handleSaveProject = async () => {
    addTestResult('🔄 Testing project save...');
    const testProject = {
      id: 'test-project-' + Date.now(),
      name: 'Electron Test Project',
      lyrics: { phrases: [] },
      templates: {},
      parameters: {},
      timing: {},
      metadata: {
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        version: '1.0.0'
      }
    };
    
    try {
      const savedPath = await electronFileManager.saveProject(testProject);
      addTestResult(`✅ Project saved: ${savedPath}`);
      setProjectData(testProject);
    } catch (error: any) {
      addTestResult(`❌ Project save failed: ${error.message}`);
    }
  };
  
  const handleLoadProject = async () => {
    addTestResult('🔄 Testing project load...');
    try {
      const loadedProject = await electronFileManager.loadProject();
      addTestResult(`✅ Project loaded: ${loadedProject.name}`);
      setProjectData(loadedProject);
    } catch (error: any) {
      addTestResult(`❌ Project load failed: ${error.message}`);
    }
  };
  
  const handleLoadVideoForPlayback = async () => {
    addTestResult('🔄 Testing video loading for playback...');
    try {
      const video = await electronMediaManager.loadBackgroundVideo();
      if (video) {
        setLoadedVideo(video);
        addTestResult(`✅ Video loaded: ${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(2)}s`);
      }
    } catch (error: any) {
      addTestResult(`❌ Video loading failed: ${error.message}`);
    }
  };
  
  const handleLoadAudioForPlayback = async () => {
    addTestResult('🔄 Testing audio loading for playback...');
    try {
      const audio = await electronMediaManager.loadBackgroundAudio();
      if (audio) {
        setLoadedAudio(audio);
        addTestResult(`✅ Audio loaded: ${audio.duration.toFixed(2)}s`);
      }
    } catch (error: any) {
      addTestResult(`❌ Audio loading failed: ${error.message}`);
    }
  };
  
  const handleTestPlayback = () => {
    addTestResult('🔄 Testing media playback...');
    try {
      electronMediaManager.playMedia();
      addTestResult('✅ Media playback started');
    } catch (error: any) {
      addTestResult(`❌ Playback failed: ${error.message}`);
    }
  };
  
  const handleTestPause = () => {
    addTestResult('🔄 Testing media pause...');
    try {
      electronMediaManager.pauseMedia();
      addTestResult('✅ Media paused');
    } catch (error: any) {
      addTestResult(`❌ Pause failed: ${error.message}`);
    }
  };
  
  if (!isElectron) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>Visiblyrics</h1>
        <p style={{ color: 'orange' }}>
          Running in browser mode. Electron features are not available.
        </p>
        <p>To use the full desktop app features, please run this as an Electron application.</p>
      </div>
    );
  }
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Visiblyrics - Electron Desktop App</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>App Info</h2>
        <p><strong>Version:</strong> {appVersion}</p>
        <p><strong>Platform:</strong> {electronAPI?.platform}</p>
        <p><strong>Electron API:</strong> ✅ Available</p>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>File System Test</h2>
        
        <div style={{ marginBottom: '15px' }}>
          <h3>Media File Selection</h3>
          <button 
            onClick={handleSelectVideo}
            style={{ 
              marginRight: '10px', 
              padding: '10px 20px',
              backgroundColor: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Select Video File
          </button>
          
          <button 
            onClick={handleSelectAudio}
            style={{ 
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Select Audio File
          </button>
          
          {selectedFile && (
            <div style={{ 
              marginTop: '10px', 
              padding: '10px',
              backgroundColor: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: '4px'
            }}>
              {selectedFile}
            </div>
          )}
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <h3>Project File Management</h3>
          <button 
            onClick={handleSaveProject}
            style={{ 
              marginRight: '10px', 
              padding: '10px 20px',
              backgroundColor: '#ffc107',
              color: 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Save Test Project
          </button>
          
          <button 
            onClick={handleLoadProject}
            style={{ 
              padding: '10px 20px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Load Project
          </button>
          
          {projectData && (
            <div style={{ 
              marginTop: '10px', 
              padding: '10px',
              backgroundColor: '#e7f3ff',
              border: '1px solid #b3d4fc',
              borderRadius: '4px'
            }}>
              <strong>Loaded Project:</strong> {projectData.name} (ID: {projectData.id})
            </div>
          )}
        </div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Media Playback Test</h2>
        
        <div style={{ marginBottom: '15px' }}>
          <h3>Load Media for Playback</h3>
          <button 
            onClick={handleLoadVideoForPlayback}
            style={{ 
              marginRight: '10px', 
              padding: '10px 20px',
              backgroundColor: '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Load Video for Playback
          </button>
          
          <button 
            onClick={handleLoadAudioForPlayback}
            style={{ 
              padding: '10px 20px',
              backgroundColor: '#e83e8c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Load Audio for Playback
          </button>
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <h3>Playback Control</h3>
          <button 
            onClick={handleTestPlayback}
            disabled={!loadedVideo && !loadedAudio}
            style={{ 
              marginRight: '10px', 
              padding: '10px 20px',
              backgroundColor: !loadedVideo && !loadedAudio ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !loadedVideo && !loadedAudio ? 'not-allowed' : 'pointer'
            }}
          >
            Play Media
          </button>
          
          <button 
            onClick={handleTestPause}
            disabled={!loadedVideo && !loadedAudio}
            style={{ 
              padding: '10px 20px',
              backgroundColor: !loadedVideo && !loadedAudio ? '#6c757d' : '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !loadedVideo && !loadedAudio ? 'not-allowed' : 'pointer'
            }}
          >
            Pause Media
          </button>
        </div>
        
        {(loadedVideo || loadedAudio) && (
          <div style={{ 
            padding: '10px',
            backgroundColor: '#d4edda',
            border: '1px solid #c3e6cb',
            borderRadius: '4px'
          }}>
            <strong>Loaded Media:</strong>
            {loadedVideo && <div>📹 Video: {loadedVideo.videoWidth}x{loadedVideo.videoHeight}, {loadedVideo.duration.toFixed(2)}s</div>}
            {loadedAudio && <div>🔊 Audio: {loadedAudio.duration.toFixed(2)}s</div>}
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Test Results</h2>
        <div style={{ 
          height: '200px',
          overflowY: 'auto',
          padding: '10px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {testResults.map((result, index) => (
            <div key={index} style={{ marginBottom: '5px' }}>
              {result}
            </div>
          ))}
        </div>
      </div>
      
      <div>
        <h2>Next Steps</h2>
        <ul>
          <li>✅ Electron app startup</li>
          <li>✅ IPC communication</li>
          <li>✅ File system access</li>
          <li>🔄 Integrate with existing Visiblyrics components</li>
          <li>🔄 Video export functionality</li>
        </ul>
      </div>
    </div>
  );
};