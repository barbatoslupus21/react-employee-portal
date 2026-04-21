'use client';

import React from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalClose,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { X } from 'lucide-react';

interface AvatarUploaderProps {
  /** Controlled open state — managed by the parent */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The file that was already selected via the OS file picker */
  initialFile: File | null;
  onUpload: (file: File) => Promise<{ success: boolean }>;
  aspect?: number;
}

export function AvatarUploader({
  open,
  onOpenChange,
  initialFile,
  onUpload,
  aspect = 1,
}: AvatarUploaderProps) {
  const [crop, setCrop] = React.useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [photo, setPhoto] = React.useState<{ url: string; file: File | null }>({
    url: '',
    file: null,
  });
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);

  // When the modal opens with a new file, seed the cropper
  React.useEffect(() => {
    if (open && initialFile) {
      setPhoto((prev) => {
        if (prev.url) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(initialFile), file: initialFile };
      });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setError(null);
    }
  }, [open, initialFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup blob URL on unmount
  React.useEffect(() => {
    return () => { if (photo.url) URL.revokeObjectURL(photo.url); };
  }, [photo.url]);

  const handleCropComplete = (_: Area, cropped: Area) => {
    setCroppedAreaPixels(cropped);
  };

  const handleApply = async () => {
    if (!photo.file || !croppedAreaPixels) {
      setError('No image to crop.');
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      const result = await getCroppedImg(photo.url, croppedAreaPixels);
      if (!result?.file) throw new Error('Failed to crop image');
      const file = new File([result.file], photo.file.name, { type: photo.file.type });
      await onUpload(file);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!isPending) onOpenChange(v); }}
      drawerProps={{ dismissible: !isPending }}
    >
      <ModalContent className="md:max-w-md p-0" hideCloseButton>
        <ModalHeader className="flex-row items-center justify-between gap-3 border-b border-[var(--color-border)]">
          <ModalTitle className="text-base font-semibold text-[var(--color-text-primary)]">
            Crop Profile Picture
          </ModalTitle>
          <ModalClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              aria-label="Close crop dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </ModalClose>
        </ModalHeader>

        <ModalBody className="space-y-3 pb-0 mb-0">
          {photo.file && (
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)]">
              <Cropper
                image={photo.url}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
                classes={{
                  containerClassName: isPending ? 'opacity-60 pointer-events-none' : '',
                }}
              />
            </div>
          )}

          {photo.file && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 mb-0 pb-0 text-xs text-[var(--color-text-muted)]">
                <span>Zoom</span>
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <Slider
                value={zoom}
                onChange={setZoom}
                min={1}
                max={3}
                step={0.05}
                disabled={isPending}
              />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </ModalBody>

        <ModalFooter className="grid w-full grid-cols-2 gap-2 p-4">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending || !photo.file}
            onClick={handleApply}
            className="w-full"
          >
            {isPending ? 'Uploading…' : 'Apply'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ── Canvas crop helpers ──────────────────────────────────────────────────── */

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = url;
  });

function getRadianAngle(deg: number) {
  return (deg * Math.PI) / 180;
}

function rotateSize(w: number, h: number, rotation: number) {
  const rad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rad) * w) + Math.abs(Math.sin(rad) * h),
    height: Math.abs(Math.sin(rad) * w) + Math.abs(Math.cos(rad) * h),
  };
}

async function getCroppedImg(
  src: string,
  pixelCrop: Area,
  rotation = 0,
  flip = { horizontal: false, vertical: false },
): Promise<{ url: string; file: Blob | null } | null> {
  const image = await createImage(src);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context');

  const rotRad = getRadianAngle(rotation);
  const { width: bw, height: bh } = rotateSize(image.width, image.height, rotation);

  canvas.width = bw;
  canvas.height = bh;

  ctx.translate(bw / 2, bh / 2);
  ctx.rotate(rotRad);
  ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(data, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Failed to generate cropped blob')); return; }
      resolve({ url: URL.createObjectURL(blob), file: blob });
    }, 'image/jpeg', 0.92);
  });
}
