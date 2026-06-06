'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  /** Called with the captured frame as a JPEG blob. The dialog then closes. */
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

/**
 * Desktop webcam capture (getUserMedia). Mobile uses the native camera input
 * instead (`<input capture>`), so this is only mounted on fine-pointer devices.
 * The stream is requested inside the mount (which itself happens from a user
 * gesture) and every track is stopped when the dialog unmounts so the camera
 * light never lingers.
 */
export function WebcamCaptureDialog({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'live' | 'error'>('starting');
  const [error, setError] = useState<string>('');

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support webcam capture.');
        setStatus('error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('live');
      } catch (err) {
        const name = (err as DOMException)?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access and try again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : 'Could not start the camera.',
        );
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          stop();
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
        </DialogHeader>
        <div className="relative flex items-center justify-center rounded-md bg-black/90 overflow-hidden min-h-[280px]">
          {status === 'error' ? (
            <p className="p-6 text-sm text-center text-muted-foreground">{error}</p>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="max-h-[60vh] w-full object-contain"
              />
              {status === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center text-white/80">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={capture} disabled={status !== 'live'}>
            <Camera className="mr-2 h-4 w-4" />
            Capture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
