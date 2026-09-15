import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RotateCw, CheckCircle } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setError('Unable to access camera. Please check permissions and try again.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(imageData);
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmCapture = () => {
    if (!capturedImage) return;

    // Convert data URL to File object
    fetch(capturedImage)
      .then(res => res.blob())
      .then(blob => {
        const file = new File(
          [blob],
          `package-scan-${Date.now()}.jpg`,
          { type: 'image/jpeg' }
        );
        onCapture(file);
        onClose();
      });
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setCapturedImage(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Capture package image"
    >
      <div className="max-w-4xl w-full bg-gov-850 border border-slate-700 rounded-xl overflow-hidden shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Camera className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-100">Capture package image</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close camera"
            className="w-8 h-8 rounded-md hover:bg-gov-800 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera View / Preview */}
        <div className="relative bg-black aspect-video flex items-center justify-center">
          {error ? (
            <div className="text-center p-8 space-y-3 max-w-sm">
              <div className="w-11 h-11 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto">
                <X className="w-5 h-5 text-rose-400" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-slate-100">Camera unavailable</p>
              <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
              <button
                onClick={startCamera}
                className="inline-flex items-center justify-center h-9 px-3.5 bg-gold-500 hover:bg-gold-600 text-white dark:text-gov-950 rounded-md text-sm font-medium transition-colors"
              >
                Retry camera access
              </button>
            </div>
          ) : capturedImage ? (
            <img
              src={capturedImage}
              alt="Captured package"
              className="w-full h-full object-contain"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Overlay Guidelines */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-5 border border-white/30 rounded-lg"></div>
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white/15"></div>
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/15"></div>
              </div>
              <div className="absolute bottom-5 left-0 right-0 text-center">
                <p className="text-white text-xs font-medium bg-black/60 inline-block px-3 py-1.5 rounded-md">
                  Align the package within the frame
                </p>
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls */}
        <div className="p-5 flex items-center justify-center gap-4">
          {capturedImage ? (
            <>
              <button
                onClick={retakePhoto}
                className="inline-flex items-center gap-2 h-11 px-5 bg-gov-800 hover:bg-gov-700 text-slate-100 border border-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                <RotateCw className="w-4 h-4" aria-hidden="true" />
                Retake
              </button>
              <button
                onClick={confirmCapture}
                className="inline-flex items-center gap-2 h-11 px-5 bg-gold-500 hover:bg-gold-600 text-white dark:text-gov-950 rounded-lg text-sm font-medium transition-colors"
              >
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                Use this photo
              </button>
            </>
          ) : (
            <>
              <button
                onClick={switchCamera}
                className="w-11 h-11 bg-gov-800 hover:bg-gov-700 border border-slate-700 rounded-full flex items-center justify-center text-slate-200 transition-colors"
                title="Switch camera"
                aria-label="Switch camera"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                onClick={capturePhoto}
                disabled={!stream}
                aria-label="Capture photo"
                className="w-16 h-16 bg-gold-500 hover:bg-gold-600 disabled:bg-gov-700 rounded-full flex items-center justify-center transition-colors disabled:cursor-not-allowed"
              >
                <div className="w-14 h-14 rounded-full border-4 border-white/90"></div>
              </button>
              <div className="w-12"></div> {/* Spacer for symmetry */}
            </>
          )}
        </div>

        <div className="px-5 pb-5 text-center">
          <p className="text-2xs text-slate-500">
            Ensure good lighting and that the Principal Display Panel is clearly visible.
          </p>
        </div>
      </div>
    </div>
  );
};
