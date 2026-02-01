import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Photo, SlideshowSettings, AudioTrack } from '../types';

export interface ExportProgress {
  stage: 'loading' | 'rendering' | 'encoding' | 'done' | 'error';
  progress: number; // 0-100
  message: string;
}

interface ExportOptions {
  width: number;
  height: number;
  fps: number;
}

const DEFAULT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080,
  fps: 30,
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
        message: `Codificando video: ${Math.round(p * 100)}%`,
      }));
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
  };

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // Draw image preserving aspect ratio with letterbox/pillarbox (black bars)
  const drawImageContain = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    canvasWidth: number,
    canvasHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number
  ) => {
    const imgRatio = img.width / img.height;
    const canvasRatio = canvasWidth / canvasHeight;

    let drawWidth: number;
    let drawHeight: number;

    // Contain: fit image inside canvas without cropping
    if (imgRatio > canvasRatio) {
      // Image is wider than canvas - fit to width
      drawWidth = canvasWidth * scale;
      drawHeight = drawWidth / imgRatio;
    } else {
      // Image is taller than canvas - fit to height
      drawHeight = canvasHeight * scale;
      drawWidth = drawHeight * imgRatio;
    }

    const x = (canvasWidth - drawWidth) / 2 + offsetX * canvasWidth;
    const y = (canvasHeight - drawHeight) / 2 + offsetY * canvasHeight;

    ctx.drawImage(img, x, y, drawWidth, drawHeight);
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

  const renderFrames = async (
    photos: Photo[],
    settings: SlideshowSettings,
    options: ExportOptions,
    targetDuration?: number // duração total desejada em segundos
  ): Promise<Blob[]> => {
    const { width, height, fps } = options;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const framesPerPhoto = Math.round(settings.photoDuration * fps);
    const transitionFrames = Math.round((settings.transitionDuration / 1000) * fps);

    // Calcular total de frames baseado na duração alvo ou nas fotos
    const baseDuration = photos.length * settings.photoDuration;
    const totalDuration = targetDuration || baseDuration;
    const totalFrames = Math.round(totalDuration * fps);

    const frames: Blob[] = [];
    const images: HTMLImageElement[] = [];

    // Pre-load all images
    setProgress({
      stage: 'rendering',
      progress: 0,
      message: 'Carregando imagens...',
    });

    for (const photo of photos) {
      images.push(await loadImage(photo.url));
    }

    // Render frames (com loop de fotos se necessário)
    for (let frame = 0; frame < totalFrames; frame++) {
      if (abortRef.current) throw new Error('Export cancelled');

      // Calcular qual foto mostrar (com loop)
      const absolutePhotoIndex = Math.floor(frame / framesPerPhoto);
      const photoIndex = absolutePhotoIndex % photos.length;
      const frameInPhoto = frame % framesPerPhoto;
      const photoProgress = frameInPhoto / framesPerPhoto;

      // Clear canvas with black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const currentImg = images[photoIndex];
      const isCinematic = isCinematicEffect(settings.transitionEffect);

      if (isCinematic) {
        // Ken Burns animation - usar absolutePhotoIndex para variar as animações
        const config = getAnimationConfig(absolutePhotoIndex, settings.transitionEffect);
        const easedProgress = easeInOutCubic(photoProgress);

        const scale = config.startScale + (config.endScale - config.startScale) * easedProgress;
        const offsetX = config.startX + (config.endX - config.startX) * easedProgress;
        const offsetY = config.startY + (config.endY - config.startY) * easedProgress;

        // Handle crossfade transition
        if (frameInPhoto < transitionFrames && absolutePhotoIndex > 0) {
          const transitionProgress = frameInPhoto / transitionFrames;
          const prevPhotoIndex = (absolutePhotoIndex - 1) % photos.length;
          const prevImg = images[prevPhotoIndex];
          const prevConfig = getAnimationConfig(absolutePhotoIndex - 1, settings.transitionEffect);

          // Draw previous image fading out
          ctx.globalAlpha = 1 - transitionProgress;
          drawImageContain(
            ctx,
            prevImg,
            width,
            height,
            prevConfig.endScale,
            prevConfig.endX,
            prevConfig.endY
          );

          // Draw current image fading in
          ctx.globalAlpha = transitionProgress;
        }

        drawImageContain(ctx, currentImg, width, height, scale, offsetX, offsetY);
        ctx.globalAlpha = 1;
      } else {
        // Simple transition
        if (frameInPhoto < transitionFrames && absolutePhotoIndex > 0) {
          const transitionProgress = frameInPhoto / transitionFrames;
          const prevPhotoIndex = (absolutePhotoIndex - 1) % photos.length;
          const prevImg = images[prevPhotoIndex];

          ctx.globalAlpha = 1 - transitionProgress;
          drawImageContain(ctx, prevImg, width, height, 1, 0, 0);
          ctx.globalAlpha = transitionProgress;
        }

        drawImageContain(ctx, currentImg, width, height, 1, 0, 0);
        ctx.globalAlpha = 1;
      }

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95);
      });
      frames.push(blob);

      setProgress({
        stage: 'rendering',
        progress: Math.round((frame / totalFrames) * 50),
        message: `Renderizando frame ${frame + 1} de ${totalFrames}`,
      });
    }

    return frames;
  };

  const exportVideo = useCallback(
    async (
      photos: Photo[],
      settings: SlideshowSettings,
      audio: AudioTrack | null,
      options: Partial<ExportOptions> = {}
    ): Promise<Blob | null> => {
      if (photos.length === 0) return null;

      const opts = { ...DEFAULT_OPTIONS, ...options };
      setIsExporting(true);
      abortRef.current = false;

      try {
        // Load FFmpeg
        setProgress({
          stage: 'loading',
          progress: 0,
          message: 'Carregando codificador de video...',
        });
        const ffmpeg = await loadFFmpeg();

        // Calcular duração alvo (se fitToMusic estiver ativo)
        const targetDuration = settings.fitToMusic && audio?.duration
          ? audio.duration
          : undefined;

        // Render frames
        const frames = await renderFrames(photos, settings, opts, targetDuration);

        // Write frames to FFmpeg filesystem
        setProgress({
          stage: 'encoding',
          progress: 50,
          message: 'Preparando frames...',
        });

        for (let i = 0; i < frames.length; i++) {
          const frameData = await frames[i].arrayBuffer();
          await ffmpeg.writeFile(
            `frame${String(i).padStart(6, '0')}.jpg`,
            new Uint8Array(frameData)
          );
        }

        // Write audio if present
        let hasAudio = false;
        if (audio) {
          try {
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

        // Encode video
        setProgress({
          stage: 'encoding',
          progress: 55,
          message: 'Codificando video...',
        });

        const ffmpegArgs = [
          '-framerate', String(opts.fps),
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
          '-preset', 'medium',
          '-crf', '23',
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

        // Cleanup
        for (let i = 0; i < frames.length; i++) {
          await ffmpeg.deleteFile(`frame${String(i).padStart(6, '0')}.jpg`);
        }
        if (hasAudio) {
          await ffmpeg.deleteFile('audio.mp3');
        }
        await ffmpeg.deleteFile('output.mp4');

        setProgress({
          stage: 'done',
          progress: 100,
          message: 'Video exportado com sucesso!',
        });

        return videoBlob;
      } catch (error) {
        console.error('Export error:', error);
        setProgress({
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Erro ao exportar video',
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
  };
}
