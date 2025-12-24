import { useState, useCallback, useRef } from "react";

export const useMicrophone = () => {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const startMicrophone = useCallback(async () => {
        try {
            const userStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            // Find a supported mime type
            const mimeTypes = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/ogg;codecs=opus",
                "audio/mp4",
                "audio/wav",
            ];

            let supportedType = "";
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    supportedType = type;
                    break;
                }
            }

            console.log("Supported combined mime type found:", supportedType);

            const mediaRecorder = new MediaRecorder(userStream, {
                mimeType: supportedType,
            });

            mediaStreamRef.current = userStream;
            setStream(userStream);
            setRecorder(mediaRecorder);
            setIsRecording(true);

            return mediaRecorder;
        } catch (err) {
            console.error("Error accessing microphone:", err);
            throw err;
        }
    }, []);

    const stopMicrophone = useCallback(() => {
        if (recorder && recorder.state !== "inactive") {
            recorder.stop();
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        setStream(null);
        setRecorder(null);
        setIsRecording(false);
    }, [recorder]);

    return {
        stream,
        recorder,
        isRecording,
        startMicrophone,
        stopMicrophone,
    };
};
