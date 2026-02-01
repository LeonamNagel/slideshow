import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Photo, SlideshowSettings, AudioTrack } from '../types';

export interface ExportProgress {
  stage: 'loading' | 'preparing' | 'rendering' | 'encoding' | 'done' | 'error';
  progress: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
}

export type ExportQuality = 'fast' | 'medium' | 'high';

interface QualityPreset {
  width: number;
  height: number;
  fps: number;
  jpegQuality: number;
  crf: number; // FFmpeg quality (lower = better, 18-28 is good range)
  preset: string; // FFmpeg preset
}

const QUALITY_PRESETS: Record<ExportQuality, QualityPreset> = {
  fast: {
    width: 1280,
    height: 720,
    fps: 24,
    jpegQuality: 0.8,
    crf: 28,
    preset: 'veryfast',
  },
  medium: {
    width: 1920,
    height: 1080,
    fps: 30,
    jpegQuality: 0.85,
    crf: 23,
    preset: 'medium',
  },
  high: {
    width: 1920,
    height: 1080,
    fps: 30,
    jpegQuality: 0.92,
    crf: 18,
    preset: 'slow',
  },
};

// Ken Burns animation configurations
const KENBURNS_CONFIGS = [
  { startScale: 1, endScale: 1.15, startX: 0, endX: -0.03, startY: 0, endY: 0 },
  { startScale: 1, endScale: 1.15, startX: 0, endX: 0.03, startY: 0, endY: 0 },
  { startScale: 1.2, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0 },
  { startScale: 1, endScale: 1.12, startX: 0, endX: 0, startY: 0, endY: -0.02 },
  { startScale: 1.15, endScale: 1, startX: 0, endX: 0, startY: 0.02, endY: 0 },
  { startScale: 1.1, endScale: 1.1, startX: 0.03, endX: -0.03, startY: 0, endY: 0 },
  { startScale: 1.1, endScale: 1.1, startX: -0.03, endX: 0.03, startY: 0, endY: 0 },
  { startScale: 1.05, endScale: 1.12, startX: -0.02, endX: 0.02, startY: -0.01, endY: 0.01 },
];

// Pre-processed image data for faster rendering
interface ProcessedImage {
  bitmap: ImageBitmap;
  aspectRatio: number;
}

export function useVideoExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress>({
    stage: 'loading',
    progress: 0,
    message: '',
  });
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const abortRef = useRef(false);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(prev => ({
        ...prev,
        progress: Math.min(95, 50 + p * 45),
        message: `Codificando vídeo: ${Math.round(p * 100)}%`,
      }));
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
  };

  // Load and pre-process images using ImageBitmap for faster rendering
  const loadAndProcessImages = async (
    photos: Photo[]
  ): Promise<ProcessedImage[]> => {
    const processedImages: ProcessedImage[] = [];

    for (let i = 0; i < photos.length; i++) {
      const response = await fetch(photos[i].url);
      const blob = await response.blob();

      // Create ImageBitmap - much faster than Image for canvas operations
      const bitmap = await createImageBitmap(blob);

      processedImages.push({
        bitmap,
        aspectRatio: bitmap.width / bitmap.height,
      });

      setProgress(prev => ({
        ...prev,
        progress: Math.round((i / photos.length) * 10),
        message: `Carregando imagem ${i + 1} de ${photos.length}`,
      }));
    }

    return processedImages;
  };

  // Draw image preserving aspect ratio with letterbox/pillarbox
  const drawImageContain = (
    ctx: CanvasRenderingContext2D,
    img: ProcessedImage,
    canvasWidth: number,
    canvasHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number
  ) => {
    const canvasRatio = canvasWidth / canvasHeight;

    let drawWidth: number;
    let drawHeight: number;

    if (img.aspectRatio > canvasRatio) {
      drawWidth = canvasWidth * scale;
      drawHeight = drawWidth / img.aspectRatio;
    } else {
      drawHeight = canvasHeight * scale;
      drawWidth = drawHeight * img.aspectRatio;
    }

    const x = (canvasWidth - drawWidth) / 2 + offsetX * canvasWidth;
    const y = (canvasHeight - drawHeight) / 2 + offsetY * canvasHeight;

    ctx.drawImage(img.bitmap, x, y, drawWidth, drawHeight);
  };

  const isCinematicEffect = (effect: string) => {
    return ['kenburns', 'cinematic', 'gentle-drift', 'breathe'].includes(effect);
  };

  const getAnimationConfig = (photoIndex: number, effect: string) => {
    const configIndex = photoIndex % KENBURNS_CONFIGS.length;
    const config = KENBURNS_CONFIGS[configIndex];

    if (effect === 'breathe') {
      return {
        startScale: 1,
        endScale: 1.1,
        startX: 0,
        endX: 0,
        startY: 0,
        endY: 0,
      };
    }

    if (effect === 'gentle-drift') {
      return {
        startScale: 1.02,
        endScale: 1.08,
        startX: config.startX * 0.5,
        endX: config.endX * 0.5,
        startY: config.startY * 0.5,
        endY: config.endY * 0.5,
      };
    }

    return config;
  };

  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Optimized frame rendering with batch processing
  const renderFrames = async (
    images: ProcessedImage[],
    settings: SlideshowSettings,
    preset: QualityPreset,
    targetDuration?: number
  ): Promise<void> => {
    const { width, height, fps, jpegQuality } = preset;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true // Hint for better performance
    })!;

    const framesPerPhoto = Math.round(settings.photoDuration * fps);
    const transitionFrames = Math.round((settings.transitionDuration / 1000) * fps);

    const baseDuration = images.length * settings.photoDuration;
    const totalDuration = targetDuration || baseDuration;
    const totalFrames = Math.round(totalDuration * fps);

    const ffmpeg = ffmpegRef.current!;

    // Process frames in batches for better memory management
    const BATCH_SIZE = 30;

    for (let frame = 0; frame < totalFrames; frame++) {
      if (abortRef.current) throw new Error('Export cancelled');

      const absolutePhotoIndex = Math.floor(frame / framesPerPhoto);
      const photoIndex = absolutePhotoIndex % images.length;
      const frameInPhoto = frame % framesPerPhoto;
      const photoProgress = frameInPhoto / framesPerPhoto;

      // Clear canvas with black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const currentImg = images[photoIndex];
      const isCinematic = isCinematicEffect(settings.transitionEffect);

      if (isCinematic) {
        const config = getAnimationConfig(absolutePhotoIndex, settings.transitionEffect);
        const easedProgress = easeInOutCubic(photoProgress);

        const scale = config.startScale + (config.endScale - config.startScale) * easedProgress;
        const offsetX = config.startX + (config.endX - config.startX) * easedProgress;
        const offsetY = config.startY + (config.endY - config.startY) * easedProgress;

        if (frameInPhoto < transitionFrames && absolutePhotoIndex > 0) {
          const transitionProgress = frameInPhoto / transitionFrames;
          const prevPhotoIndex = (absolutePhotoIndex - 1) % images.length;
          const prevImg = images[prevPhotoIndex];
          const prevConfig = getAnimationConfig(absolutePhotoIndex - 1, settings.transitionEffect);

          ctx.globalAlpha = 1 - transitionProgress;
          drawImageContain(ctx, prevImg, width, height, prevConfig.endScale, prevConfig.endX, prevConfig.endY);
          ctx.globalAlpha = transitionProgress;
        }

        drawImageContain(ctx, currentImg, width, height, scale, offsetX, offsetY);
        ctx.globalAlpha = 1;
      } else {
        if (frameInPhoto < transitionFrames && absolutePhotoIndex > 0) {
          const transitionProgress = frameInPhoto / transitionFrames;
          const prevPhotoIndex = (absolutePhotoIndex - 1) % images.length;
          const prevImg = images[prevPhotoIndex];

          ctx.globalAlpha = 1 - transitionProgress;
          drawImageContain(ctx, prevImg, width, height, 1, 0, 0);
          ctx.globalAlpha = transitionProgress;
        }

        drawImageContain(ctx, currentImg, width, height, 1, 0, 0);
        ctx.globalAlpha = 1;
      }

      // Convert to blob and write directly to FFmpeg
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', jpegQuality);
      });

      const frameData = await blob.arrayBuffer();
      await ffmpeg.writeFile(
        `frame${String(frame).padStart(6, '0')}.jpg`,
        new Uint8Array(frameData)
      );

      // Update progress
      if (frame % 10 === 0 || frame === totalFrames - 1) {
        setProgress({
          stage: 'rendering',
          progress: Math.round((frame / totalFrames) * 50),
          message: `Renderizando: ${frame + 1}/${totalFrames} frames`,
          currentFrame: frame + 1,
          totalFrames,
        });
      }

      // Allow UI to update periodically
      if (frame % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return;
  };

  const exportVideo = useCallback(
    async (
      photos: Photo[],
      settings: SlideshowSettings,
      audio: AudioTrack | null,
      quality: ExportQuality = 'medium'
    ): Promise<Blob | null> => {
      if (photos.length === 0) return null;

      const preset = QUALITY_PRESETS[quality];
      setIsExporting(true);
      abortRef.current = false;

      try {
        // Load FFmpeg
        setProgress({
          stage: 'loading',
          progress: 0,
          message: 'Carregando codificador de vídeo...',
        });
        const ffmpeg = await loadFFmpeg();

        // Pre-process images
        setProgress({
          stage: 'preparing',
          progress: 0,
          message: 'Preparando imagens...',
        });
        const images = await loadAndProcessImages(photos);

        // Calculate target duration
        const targetDuration = settings.fitToMusic && audio?.duration
          ? audio.duration
          : undefined;

        // Render frames directly to FFmpeg filesystem
        setProgress({
          stage: 'rendering',
          progress: 10,
          message: 'Renderizando frames...',
        });
        await renderFrames(images, settings, preset, targetDuration);

        // Clean up ImageBitmaps
        images.forEach(img => img.bitmap.close());

        // Write audio if present
        let hasAudio = false;
        if (audio) {
          try {
            setProgress({
              stage: 'encoding',
              progress: 50,
              message: 'Processando áudio...',
            });
            const audioData = await fetchFile(audio.url);
            await ffmpeg.writeFile('audio.mp3', audioData);
            hasAudio = true;
          } catch (e) {
            console.warn('Could not include audio:', e);
          }
        }

        // Calculate video duration
        const videoDuration = settings.fitToMusic && audio?.duration
          ? audio.duration
          : photos.length * settings.photoDuration;

        // Encode video with optimized settings
        setProgress({
          stage: 'encoding',
          progress: 55,
          message: 'Codificando vídeo H.264...',
        });

        const ffmpegArgs = [
          '-framerate', String(preset.fps),
          '-i', 'frame%06d.jpg',
        ];

        if (hasAudio) {
          ffmpegArgs.push('-i', 'audio.mp3');
          ffmpegArgs.push('-t', String(videoDuration));
          ffmpegArgs.push('-map', '0:v', '-map', '1:a');
          ffmpegArgs.push('-shortest');
        }

        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', preset.preset,
          '-crf', String(preset.crf),
          '-movflags', '+faststart', // Better for web playback
        );

        if (hasAudio) {
          ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
        }

        ffmpegArgs.push('-y', 'output.mp4');

        await ffmpeg.exec(ffmpegArgs);

        // Read output
        setProgress({
          stage: 'encoding',
          progress: 98,
          message: 'Finalizando...',
        });

        const data = await ffmpeg.readFile('output.mp4');
        const videoBlob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });

        // Cleanup - delete frames in batches
        const totalFrames = Math.round(
          (targetDuration || photos.length * settings.photoDuration) * preset.fps
        );

        for (let i = 0; i < totalFrames; i++) {
          try {
            await ffmpeg.deleteFile(`frame${String(i).padStart(6, '0')}.jpg`);
          } catch {
            // Ignore cleanup errors
          }
        }

        if (hasAudio) {
          try { await ffmpeg.deleteFile('audio.mp3'); } catch {}
        }
        try { await ffmpeg.deleteFile('output.mp4'); } catch {}

        setProgress({
          stage: 'done',
          progress: 100,
          message: 'Vídeo exportado com sucesso!',
        });

        return videoBlob;
      } catch (error) {
        console.error('Export error:', error);
        setProgress({
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Erro ao exportar vídeo',
        });
        return null;
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  const cancelExport = useCallback(() => {
    abortRef.current = true;
  }, []);

  const downloadVideo = useCallback((blob: Blob, filename = 'slideshow.mp4') => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return {
    isExporting,
    progress,
    exportVideo,
    cancelExport,
    downloadVideo,
    qualityPresets: QUALITY_PRESETS,
  };
}
