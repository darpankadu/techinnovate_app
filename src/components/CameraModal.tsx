import { useState, useEffect, useRef } from 'react'
import { X, RotateCcw, Check, AlertTriangle } from 'lucide-react'
import { t } from '../lib/translations'
import type { Language, CameraCapture } from '../lib/types'

export function CameraModal({ 
  mode, 
  title, 
  onCapture, 
  onClose,
  lang
}: { 
  mode: 'photo' | 'video'
  title: string
  onCapture: (capture: CameraCapture) => void
  onClose: () => void
  lang: Language
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [gps, setGps] = useState<{lat: number; lng: number} | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const capturedBlobRef = useRef<Blob | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isBlobReady, setIsBlobReady] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.body.style.height = '100dvh'
    window.scrollTo(0, 0)
    startCamera()
    getLocation()
    return () => {
      document.body.style.overflow = ''
      document.body.style.height = ''
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      )
    }
  }

  const startCamera = async () => {
    try {
      // Force the rear (environment) camera; fall back to any camera only if the device has no rear camera
      let mediaStream: MediaStream
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: mode === 'video'
        })
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: mode === 'video'
        })
      }
      streamRef.current = mediaStream
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        await videoRef.current.play()
      }
    } catch (err: any) {
      setError(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera not available. Use HTTPS.')
    }
  }

  useEffect(() => {
    let interval: any
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    
    const video = videoRef.current
    const canvas = canvasRef.current
    
    // Scale down image if it's too large to prevent massive payloads on mobile
    const MAX_WIDTH = 1024
    const MAX_HEIGHT = 1024
    let width = video.videoWidth
    let height = video.videoHeight
    
    if (width > height) {
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width)
        width = MAX_WIDTH
      }
    } else {
      if (height > MAX_HEIGHT) {
        width = Math.round((width * MAX_HEIGHT) / height)
        height = MAX_HEIGHT
      }
    }
    
    canvas.width = width
    canvas.height = height
    
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, width, height)
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
    setPreview(dataUrl)
    setIsBlobReady(false)
    
    canvas.toBlob((blob) => {
      if (blob) {
        capturedBlobRef.current = blob
        setIsBlobReady(true)
        streamRef.current?.getTracks().forEach(t => t.stop())
      }
    }, 'image/jpeg', 0.75)
  }

  const startRecording = () => {
    if (!stream) return
    
    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : ''
    const recorderOptions = mimeType ? { mimeType } : {}
    const recorder = new MediaRecorder(stream, recorderOptions)
    const actualMime = mimeType || 'video/mp4'
    mediaRecorderRef.current = recorder
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: actualMime })
      const url = URL.createObjectURL(blob)
      setPreview(url)
      setIsBlobReady(true)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
    
    recorder.start()
    setIsRecording(true)
    setRecordingTime(0)
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const handleConfirm = () => {
    if (!preview) return
    
    if (mode === 'photo') {
      const blob = capturedBlobRef.current
      if (blob) {
        onCapture({ blob, dataUrl: preview, timestamp: Date.now(), gps: gps || undefined })
      } else {
        alert('Photo is still processing. Please wait a moment and try again.')
      }
    } else {
      const mimeType = chunksRef.current[0]?.type || 'video/mp4'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      onCapture({ blob, dataUrl: preview, timestamp: Date.now(), gps: gps || undefined })
    }
  }

  const handleRetry = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    setPreview(null)
    setRecordingTime(0)
    setIsBlobReady(false)
    capturedBlobRef.current = null
    chunksRef.current = []
    startCamera()
  }

  return (
    <div className="fixed inset-0 h-dvh w-screen z-[100] bg-black overflow-hidden flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white font-medium">{title}</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="relative w-full flex-1 min-h-0">
        {!preview ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/90">
                <div className="text-center">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <p className="text-white mb-2">{error}</p>
                  <p className="text-[#6B7280] text-sm">Please allow camera access and use HTTPS</p>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-red-500">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-white font-mono text-sm">{recordingTime}s</span>
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center">
                {mode === 'photo' ? (
                  <button
                    onClick={capturePhoto}
                    disabled={!!error}
                    className="w-[72px] h-[72px] rounded-full bg-white p-1.5 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <div className="w-full h-full rounded-full border-[3px] border-black" />
                  </button>
                ) : (
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!!error || (isRecording && recordingTime < 10)}
                    className={`w-[72px] h-[72px] rounded-full active:scale-95 transition-all disabled:opacity-50 ${
                      isRecording ? 'bg-red-500 p-2' : 'bg-white p-1.5'
                    }`}
                  >
                    <div className={`w-full h-full ${isRecording ? 'bg-white rounded-md' : 'bg-red-500 rounded-full border-[3px] border-white'}`} />
                  </button>
                )}
              </div>
              {mode === 'video' && !isRecording && (
                <p className="text-center text-[#6B7280] text-[13px] mt-4">Hold for minimum 10 seconds</p>
              )}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col bg-black min-h-0">
            <div className="flex-1 relative w-full min-h-0">
              {mode === 'photo' ? (
                <img src={preview} alt="Preview" className="absolute inset-4 m-auto max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] object-contain rounded-xl" />
              ) : (
                <video src={preview} controls autoPlay className="absolute inset-4 m-auto max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] rounded-xl" />
              )}
            </div>
            
            <div className="p-6 pb-12 flex gap-3 bg-black">
              <button
                onClick={handleRetry}
                className="flex-1 h-[52px] rounded-2xl bg-white/10 backdrop-blur text-white font-medium flex items-center justify-center gap-2 hover:bg-white/20 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                {t('retry', lang)}
              </button>
              <button
                onClick={handleConfirm}
                disabled={mode === 'photo' && !isBlobReady}
                className="flex-1 h-[52px] rounded-2xl bg-[#EE2726] text-white font-semibold flex items-center justify-center gap-2 hover:bg-[#d41f1f] transition-colors disabled:opacity-60"
              >
                <Check className="w-5 h-5" />
                {t('ok', lang)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
