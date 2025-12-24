import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, Copy, Trash2, CheckCircle2, AlertTriangle, RefreshCcw } from "lucide-react";
import { getDeepgramClient, createTranscriptionConnection } from "./lib/deepgram";
import { useMicrophone } from "./hooks/useMicrophone";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function App() {
  const [transcription, setTranscription] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"offline" | "connecting" | "online" | "error">("offline");
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const { startMicrophone, stopMicrophone, isRecording } = useMicrophone();
  const connectionRef = useRef<any>(null);
  const audioBufferRef = useRef<Blob[]>([]);
  const closeTimeoutRef = useRef<any>(null);
  const keepAliveIntervalRef = useRef<any>(null);

  const stopKeepAlive = () => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  };

  const startKeepAlive = () => {
    stopKeepAlive();
    keepAliveIntervalRef.current = setInterval(() => {
      if (connectionRef.current?.getReadyState() === 1) {
        console.log("Deepgram: Heartbeat pulse");
        try {
          // Sending an empty JSON can also help keep some connections open if keepAlive() isn't enough
          connectionRef.current.keepAlive();
        } catch (e) {
          console.warn("Keep-alive pulse failed", e);
        }
      }
    }, 5000); // Pulse every 5 seconds
  };

  const closeConnection = useCallback(() => {
    console.log("Deepgram: Logic-requested close");
    if (connectionRef.current) {
      connectionRef.current.finish();
      connectionRef.current = null;
    }
    setConnectionStatus("offline");
    stopKeepAlive();
  }, []);

  const initConnection = useCallback(async () => {
    if (connectionRef.current && connectionStatus === "online") return connectionRef.current;

    console.log("Deepgram: Establishing connection...");
    setConnectionStatus("connecting");
    setError(null);

    return new Promise((resolve, reject) => {
      try {
        const dg = getDeepgramClient();
        const connection = createTranscriptionConnection(dg);
        connectionRef.current = connection;

        connection.on("open", () => {
          console.log("Deepgram: Online!");
          setConnectionStatus("online");
          startKeepAlive();
          resolve(connection);
        });

        const handleResults = (data: any) => {
          const transcript = data.channel?.alternatives[0]?.transcript;
          if (transcript) {
            if (data.is_final) {
              setTranscription((prev) => (prev + " " + transcript).trim());
              setInterimTranscript("");
            } else {
              setInterimTranscript(transcript);
            }
          }
        };

        connection.on("results", handleResults);
        connection.on("Results", handleResults);
        connection.on("transcript", handleResults);

        connection.on("error", (err: any) => {
          console.error("Deepgram: Error", err);
          setError("AI Connection Error");
          setConnectionStatus("error");
          reject(err);
        });

        connection.on("close", (event: any) => {
          console.log("Deepgram: Closed by server", event);
          setConnectionStatus("offline");
          stopKeepAlive();
        });

      } catch (err: any) {
        setConnectionStatus("error");
        setError(err.message);
        reject(err);
      }
    });
  }, [connectionStatus]);

  const handleStart = useCallback(async () => {
    // Clear any pending auto-close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setError(null);
    setInterimTranscript("");
    audioBufferRef.current = [];

    try {
      // 1. Get Mic
      const mediaRecorder = await startMicrophone();

      // 2. Ensure connection
      let connection = connectionRef.current;
      if (!connection || connection.getReadyState() !== 1) {
        connection = await initConnection();
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          if (connectionRef.current?.getReadyState() === 1) {
            // Flush buffer if any
            while (audioBufferRef.current.length > 0) {
              const chunk = audioBufferRef.current.shift();
              if (chunk) connectionRef.current.send(chunk);
            }
            connectionRef.current.send(event.data);
          } else {
            console.log("Buffering audio chunk...");
            audioBufferRef.current.push(event.data);
          }
        }
      };

      mediaRecorder.start(200);
      console.log("Interaction: recording...");
    } catch (err: any) {
      console.error("Interaction failed", err);
      setError(err.message || "Failed to start");
      setConnectionStatus("offline");
    }
  }, [startMicrophone, initConnection]);

  const handleStop = useCallback(() => {
    console.log("Interaction: stopped.");
    stopMicrophone();
    setInterimTranscript("");

    // Start 60-second grace period before closing connection
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      console.log("Grace period expired. Closing connection.");
      closeConnection();
    }, 60000); // 60 seconds
  }, [stopMicrophone, closeConnection]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcription.trim());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const clearTranscription = () => {
    setTranscription("");
    setInterimTranscript("");
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      stopKeepAlive();
      if (connectionRef.current) connectionRef.current.finish();
    };
  }, []);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Whispr Clone</h1>
        <p>Real-time Voice-to-Text Desktop App</p>
      </header>

      <main className="main-content">
        <div className="transcription-panel">
          {transcription || interimTranscript ? (
            <div className="transcription-text">
              {transcription}
              {interimTranscript && (
                <span style={{ color: "#94a3b8", marginLeft: "4px" }}>
                  {interimTranscript}...
                </span>
              )}
            </div>
          ) : (
            <div className="placeholder-text">
              {isRecording ? "Listening..." : "Hold the button below to start talking..."}
            </div>
          )}
        </div>

        {error && (
          <div className="error-banner" style={{
            color: "#ef4444", textAlign: "center", padding: "0.75rem", background: "rgba(239,68,68,0.1)",
            borderRadius: "0.5rem", marginBottom: "1rem", border: "1px solid rgba(239,68,68,0.2)", fontSize: "0.875rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="controls-section">
          <div className="status-indicator" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
            <div className={cn("status-dot",
              isRecording ? "recording" : connectionStatus === "online" ? "online" :
                connectionStatus === "connecting" ? "loading" : "idle"
            )} />
            <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase" }}>
              {isRecording ? "Capturing" : connectionStatus === "online" ? "Active" : connectionStatus}
            </span>
          </div>

          <button
            className={cn("ptt-button", isRecording && "recording")}
            onMouseDown={handleStart}
            onMouseUp={handleStop}
            onMouseLeave={isRecording ? handleStop : undefined}
            disabled={connectionStatus === "connecting"}
          >
            <Mic size={40} />
          </button>

          <p className="ptt-label" style={{
            color: "#94a3b8", fontSize: "0.875rem", fontWeight: "800", textTransform: "uppercase",
            letterSpacing: "1.5px", marginTop: "1rem"
          }}>
            {connectionStatus === "connecting" ? "Syncing..." :
              isRecording ? "Listening Now" : "Push to Talk"}
          </p>

          <div className="action-buttons">
            <button className="btn-secondary" onClick={copyToClipboard} disabled={!transcription}>
              {copySuccess ? <CheckCircle2 size={18} color="#4ade80" /> : <Copy size={18} />}
              {copySuccess ? "Copied!" : "Copy Text"}
            </button>
            <button className="btn-secondary" onClick={clearTranscription} disabled={!transcription}>
              <Trash2 size={18} />
              Clear
            </button>
          </div>
        </div>
      </main>

      <style>{`
        .status-dot.idle { background: #4b5563; }
        .status-dot.online { background: #10b981; box-shadow: 0 0 8px #10b981; }
        .status-dot.loading { background: #f59e0b; animation: pulse 1s infinite; }
        @keyframes pulse { 0% { opacity: 0.4; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

export default App;
