import { useState, useCallback, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Photo, SlideshowSettings, AudioTrack } from '../types';
import {
  detectEncoderCapabilities,
  WebCodecsVideoEncoder,
  type EncoderType,
  type EncoderCapabilities,
} from './useWebCodecsEncoder';

export interface ExportProgress {
  stage: 'loading' | 'preparing' | 'rendering' | 'encoding' | 'muxing' | 'done' | 'error';
  progress: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
  fps?: number;
  encoder?: EncoderType;
}

export type ExportQuality = 'fast' | 'medium' | 'high';

interface QualityPreset {
  width: number;
  height: number;
  fps: number;
  jpegQuality: number;
  bitrate: number; // For WebCodecs
  crf: number; // FFmpeg quality (lower = better, 18-28 is good range)
  preset: string; // FFmpeg preset
}

const QUALITY_PRESETS: Record<ExportQuality, QualityPreset> = {
  fast: {
    width: 1280,
    height: 720,
    fps: 24,
    jpegQuality: 0.8,
    bitrate: 3_000_000,
    crf: 28,
    preset: 'veryfast',
  },
  medium: {
    width: 1920,
    height: 1080,
    fps: 30,
    jpegQuality: 0.85,
    bitrate: 5_000_000,
    crf: 23,
    preset: 'medium',
  },
  high: {
    width: 1920,
    height: 1080,
    fps: 30,
    jpegQuality: 0.92,
    bitrate: 8_000_000,
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
  const [encoderCapabilities, setEncoderCapabilities] = useState<EncoderCapabilities | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const abortRef = useRef(false);
  const lastFpsUpdateRef = useRef<number>(0);
  const frameTimestampsRef = useRef<number[]>([]);

  // Detect encoder capabilities on mount
  useEffect(() => {
    detectEncoderCapabilities().then(setEncoderCapabilities);
  }, []);

  // Calculate current encoding FPS
  const calculateFps = useCallback(() => {
    const timestamps = frameTimestampsRef.current;
    if (timestamps.length < 2) return 0;

    const recentTimestamps = timestamps.slice(-10);
    const timeSpan = recentTimestamps[recentTimestamps.length - 1] - recentTimestamps[0];
    if (timeSpan === 0) return 0;

    return Math.round((recentTimestamps.length - 1) / (timeSpan / 1000));
  }, []);

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
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
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

  // Draw blurred background image (covers entire canvas)
  const drawBlurBackground = (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    img: ProcessedImage,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    ctx.save();

    // Apply blur filter
    ctx.filter = 'blur(30px)';
    ctx.globalAlpha = 0.5;

    // Scale image to cover entire canvas (like background-size: cover)
    const canvasRatio = canvasWidth / canvasHeight;
    let drawWidth: number;
    let drawHeight: number;

    if (img.aspectRatio > canvasRatio) {
      // Image is wider - fit to height and overflow width
      drawHeight = canvasHeight * 1.2; // 1.2 to account for blur edge bleeding
      drawWidth = drawHeight * img.aspectRatio;
    } else {
      // Image is taller - fit to width and overflow height
      drawWidth = canvasWidth * 1.2;
      drawHeight = drawWidth / img.aspectRatio;
    }

    const x = (canvasWidth - drawWidth) / 2;
    const y = (canvasHeight - drawHeight) / 2;

    ctx.drawImage(img.bitmap, x, y, drawWidth, drawHeight);

    ctx.restore();
  };

  // Render a single frame to canvas
  const renderFrameToCanvas = (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    images: ProcessedImage[],
    frame: number,
    settings: SlideshowSettings,
    width: number,
    height: number,
    fps: number
  ) => {
    const framesPerPhoto = Math.round(settings.photoDuration * fps);
    const transitionFrames = Math.round((settings.transitionDuration / 1000) * fps);

    const absolutePhotoIndex = Math.floor(frame / framesPerPhoto);
    const photoIndex = absolutePhotoIndex % images.length;
    const frameInPhoto = frame % framesPerPhoto;
    const photoProgress = frameInPhoto / framesPerPhoto;

    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const currentImg = images[photoIndex];

    // Draw blur background if enabled
    if (settings.blurBackground) {
      drawBlurBackground(ctx, currentImg, width, height);
    }

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
  };

  // WebCodecs export path (fast, GPU-accelerated)
  const exportWithWebCodecs = async (
    images: ProcessedImage[],
    settings: SlideshowSettings,
    preset: QualityPreset,
    targetDuration: number | undefined,
    encoderType: EncoderType
  ): Promise<Blob> => {
    const { width, height, fps, bitrate } = preset;
    const useHardware = encoderType === 'webcodecs-hardware';

    // Create OffscreenCanvas for better performance
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const baseDuration = images.length * settings.photoDuration;
    const totalDuration = targetDuration || baseDuration;
    const totalFrames = Math.round(totalDuration * fps);

    // Initialize WebCodecs encoder
    const encoder = new WebCodecsVideoEncoder(
      { width, height, fps, bitrate },
      useHardware
    );

    await encoder.initialize();
    frameTimestampsRef.current = [];

    setProgress({
      stage: 'rendering',
      progress: 10,
      message: `Renderizando com ${useHardware ? 'GPU' : 'CPU'}...`,
      currentFrame: 0,
      totalFrames,
      encoder: encoderType,
    });

    // Render and encode frames
    for (let frame = 0; frame < totalFrames; frame++) {
      if (abortRef.current) {
        encoder.close();
        throw new Error('Export cancelled');
      }

      // Render frame
      renderFrameToCanvas(ctx, images, frame, settings, width, height, fps);

      // Encode frame
      await encoder.encodeFrame(canvas, frame, totalFrames);

      // Track FPS
      frameTimestampsRef.current.push(Date.now());
      if (frameTimestampsRef.current.length > 30) {
        frameTimestampsRef.current.shift();
      }

      // Update progress
      const now = Date.now();
      if (now - lastFpsUpdateRef.current > 200 || frame === totalFrames - 1) {
        lastFpsUpdateRef.current = now;
        const currentFps = calculateFps();

        setProgress({
          stage: 'rendering',
          progress: 10 + Math.round((frame / totalFrames) * 85),
          message: `Renderizando: ${frame + 1}/${totalFrames} frames`,
          currentFrame: frame + 1,
          totalFrames,
          fps: currentFps,
          encoder: encoderType,
        });
      }

      // Allow UI to update
      if (frame % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    setProgress(prev => ({
      ...prev,
      stage: 'muxing',
      progress: 95,
      message: 'Finalizando video...',
    }));

    try {
      console.log('[Export] Calling encoder.finalize()...');
      const blob = await encoder.finalize();
      console.log(`[Export] Finalize complete, blob size: ${blob.size} bytes`);
      return blob;
    } catch (e) {
      console.error('[Export] Finalize failed:', e);
      encoder.close();
      throw e;
    }
  };

  // FFmpeg export path (fallback)
  const exportWithFFmpeg = async (
    images: ProcessedImage[],
    settings: SlideshowSettings,
    preset: QualityPreset,
    audio: AudioTrack | null,
    targetDuration: number | undefined
  ): Promise<Blob> => {
    const { width, height, fps, jpegQuality } = preset;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    })!;

    const baseDuration = images.length * settings.photoDuration;
    const totalDuration = targetDuration || baseDuration;
    const totalFrames = Math.round(totalDuration * fps);

    const ffmpeg = ffmpegRef.current!;
    frameTimestampsRef.current = [];
    const BATCH_SIZE = 30;

    for (let frame = 0; frame < totalFrames; frame++) {
      if (abortRef.current) throw new Error('Export cancelled');

      // Render frame
      renderFrameToCanvas(ctx, images, frame, settings, width, height, fps);

      // Convert to blob and write to FFmpeg
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', jpegQuality);
      });

      const frameData = await blob.arrayBuffer();
      await ffmpeg.writeFile(
        `frame${String(frame).padStart(6, '0')}.jpg`,
        new Uint8Array(frameData)
      );

      // Track FPS
      frameTimestampsRef.current.push(Date.now());
      if (frameTimestampsRef.current.length > 30) {
        frameTimestampsRef.current.shift();
      }

      // Update progress
      const now = Date.now();
      if (frame % 10 === 0 || frame === totalFrames - 1 || now - lastFpsUpdateRef.current > 200) {
        lastFpsUpdateRef.current = now;
        const currentFps = calculateFps();

        setProgress({
          stage: 'rendering',
          progress: Math.round((frame / totalFrames) * 50),
          message: `Renderizando: ${frame + 1}/${totalFrames} frames`,
          currentFrame: frame + 1,
          totalFrames,
          fps: currentFps,
          encoder: 'ffmpeg',
        });
      }

      // Allow UI to update
      if (frame % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Write audio if present
    let hasAudio = false;
    if (audio) {
      try {
        setProgress(prev => ({
          ...prev,
          stage: 'encoding',
          progress: 50,
          message: 'Processando audio...',
        }));
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
      : images.length * settings.photoDuration;

    // Encode video
    setProgress(prev => ({
      ...prev,
      stage: 'encoding',
      progress: 55,
      message: 'Codificando video H.264...',
    }));

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
      '-movflags', '+faststart',
    );

    if (hasAudio) {
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
    }

    ffmpegArgs.push('-y', 'output.mp4');

    await ffmpeg.exec(ffmpegArgs);

    // Read output
    setProgress(prev => ({
      ...prev,
      progress: 98,
      message: 'Finalizando...',
    }));

    const data = await ffmpeg.readFile('output.mp4');
    const videoBlob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });

    // Cleanup
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

    return videoBlob;
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
      lastFpsUpdateRef.current = 0;
      frameTimestampsRef.current = [];

      try {
        // Detect encoder capabilities if not already done
        let capabilities = encoderCapabilities;
        if (!capabilities) {
          setProgress({
            stage: 'loading',
            progress: 0,
            message: 'Detectando capacidades...',
          });
          capabilities = await detectEncoderCapabilities();
          setEncoderCapabilities(capabilities);
        }

        const useWebCodecs = capabilities.webcodecs && !audio; // WebCodecs doesn't handle audio yet

        if (useWebCodecs) {
          setProgress({
            stage: 'loading',
            progress: 5,
            message: capabilities.hardwareAcceleration
              ? 'Usando aceleracao GPU...'
              : 'Usando WebCodecs (CPU)...',
            encoder: capabilities.preferredEncoder,
          });
        } else {
          // Load FFmpeg for fallback
          setProgress({
            stage: 'loading',
            progress: 0,
            message: 'Carregando codificador de video...',
            encoder: 'ffmpeg',
          });
          await loadFFmpeg();
        }

        // Pre-process images
        setProgress(prev => ({
          ...prev,
          stage: 'preparing',
          progress: 0,
          message: 'Preparando imagens...',
        }));
        const images = await loadAndProcessImages(photos);

        // Calculate target duration
        const targetDuration = settings.fitToMusic && audio?.duration
          ? audio.duration
          : undefined;

        let videoBlob: Blob;

        if (useWebCodecs) {
          // Fast path: WebCodecs (GPU accelerated when available)
          videoBlob = await exportWithWebCodecs(
            images,
            settings,
            preset,
            targetDuration,
            capabilities.preferredEncoder
          );
        } else {
          // Fallback path: FFmpeg.wasm
          videoBlob = await exportWithFFmpeg(
            images,
            settings,
            preset,
            audio,
            targetDuration
          );
        }

        // Clean up ImageBitmaps
        images.forEach(img => img.bitmap.close());

        setProgress({
          stage: 'done',
          progress: 100,
          message: 'Video exportado com sucesso!',
          encoder: useWebCodecs ? capabilities.preferredEncoder : 'ffmpeg',
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
    [encoderCapabilities, calculateFps]
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
    encoderCapabilities,
  };
}
