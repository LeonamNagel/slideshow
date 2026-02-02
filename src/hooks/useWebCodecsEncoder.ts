import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export type EncoderType = 'webcodecs-hardware' | 'webcodecs-software' | 'ffmpeg';

export interface EncoderCapabilities {
  webcodecs: boolean;
  hardwareAcceleration: boolean;
  preferredEncoder: EncoderType;
}

export interface WebCodecsConfig {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
}

// Detect encoder capabilities
export async function detectEncoderCapabilities(): Promise<EncoderCapabilities> {
  // Check if VideoEncoder exists (WebCodecs API)
  if (typeof VideoEncoder === 'undefined') {
    console.log('[WebCodecs] VideoEncoder not available');
    return {
      webcodecs: false,
      hardwareAcceleration: false,
      preferredEncoder: 'ffmpeg',
    };
  }

  try {
    // Test H.264 High Profile support with hardware acceleration
    const hardwareConfig: VideoEncoderConfig = {
      codec: 'avc1.640028', // H.264 High Profile Level 4.0
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
    };

    const hardwareSupport = await VideoEncoder.isConfigSupported(hardwareConfig);
    console.log('[WebCodecs] Hardware support:', hardwareSupport.supported);

    if (hardwareSupport.supported) {
      return {
        webcodecs: true,
        hardwareAcceleration: true,
        preferredEncoder: 'webcodecs-hardware',
      };
    }

    // Test software fallback
    const softwareConfig: VideoEncoderConfig = {
      ...hardwareConfig,
      hardwareAcceleration: 'prefer-software',
    };

    const softwareSupport = await VideoEncoder.isConfigSupported(softwareConfig);
    console.log('[WebCodecs] Software support:', softwareSupport.supported);

    if (softwareSupport.supported) {
      return {
        webcodecs: true,
        hardwareAcceleration: false,
        preferredEncoder: 'webcodecs-software',
      };
    }
  } catch (e) {
    console.warn('[WebCodecs] Detection failed:', e);
  }

  return {
    webcodecs: false,
    hardwareAcceleration: false,
    preferredEncoder: 'ffmpeg',
  };
}

// WebCodecs-based video encoder class
export class WebCodecsVideoEncoder {
  private encoder: VideoEncoder | null = null;
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private frameCount = 0;
  private encodedCount = 0;
  private config: WebCodecsConfig;
  private useHardware: boolean;
  private onProgress?: (encoded: number, total: number) => void;
  private errorOccurred: Error | null = null;

  constructor(config: WebCodecsConfig, useHardware: boolean = true) {
    this.config = config;
    this.useHardware = useHardware;
  }

  setProgressCallback(callback: (encoded: number, total: number) => void) {
    this.onProgress = callback;
  }

  async initialize(): Promise<void> {
    const { width, height, fps, bitrate = 5_000_000 } = this.config;
    console.log(`[WebCodecs] Initializing encoder: ${width}x${height} @ ${fps}fps, bitrate: ${bitrate}`);

    // Create muxer
    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height,
      },
      fastStart: 'in-memory',
    });

    // Create encoder with error tracking
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.encodedCount++;
        if (this.encodedCount % 30 === 0) {
          console.log(`[WebCodecs] Encoded frame ${this.encodedCount}`);
        }
        this.muxer?.addVideoChunk(chunk, meta);
      },
      error: (e) => {
        console.error('[WebCodecs] Encoder error:', e);
        this.errorOccurred = e instanceof Error ? e : new Error(String(e));
      },
    });

    const encoderConfig: VideoEncoderConfig = {
      codec: 'avc1.640028', // H.264 High Profile
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: this.useHardware ? 'prefer-hardware' : 'prefer-software',
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };

    this.encoder.configure(encoderConfig);
    this.frameCount = 0;
    this.encodedCount = 0;
    this.errorOccurred = null;
    console.log('[WebCodecs] Encoder initialized successfully');
  }

  async encodeFrame(canvas: OffscreenCanvas | HTMLCanvasElement, frameIndex: number, totalFrames: number): Promise<void> {
    if (!this.encoder) throw new Error('Encoder not initialized');

    // Check for errors from encoder
    if (this.errorOccurred) {
      throw this.errorOccurred;
    }

    // Back-pressure: wait if queue is too full
    const MAX_QUEUE_SIZE = 10;
    let waitCount = 0;
    while (this.encoder.encodeQueueSize > MAX_QUEUE_SIZE) {
      if (waitCount === 0) {
        console.log(`[WebCodecs] Queue full (${this.encoder.encodeQueueSize}), waiting...`);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      waitCount++;

      // Safety: don't wait forever
      if (waitCount > 1000) {
        throw new Error('Encoder queue stuck - waited too long');
      }
    }

    const { fps } = this.config;
    const timestampMicros = Math.round((frameIndex / fps) * 1_000_000);
    const durationMicros = Math.round((1 / fps) * 1_000_000);

    // Create VideoFrame from canvas
    const frame = new VideoFrame(canvas, {
      timestamp: timestampMicros,
      duration: durationMicros,
    });

    // Encode with keyframe every 2 seconds
    const keyFrame = frameIndex % (fps * 2) === 0;
    this.encoder.encode(frame, { keyFrame });
    frame.close();

    this.frameCount++;

    // Log progress periodically
    if (frameIndex % 30 === 0) {
      console.log(`[WebCodecs] Queued frame ${frameIndex + 1}/${totalFrames}, queue: ${this.encoder.encodeQueueSize}, encoded: ${this.encodedCount}`);
    }

    if (this.onProgress && frameIndex % 5 === 0) {
      this.onProgress(frameIndex + 1, totalFrames);
    }
  }

  async finalize(): Promise<Blob> {
    if (!this.encoder || !this.muxer) {
      throw new Error('Encoder not initialized');
    }

    console.log('[WebCodecs] Starting finalize...');
    console.log(`[WebCodecs] Frames queued: ${this.frameCount}, encoded: ${this.encodedCount}`);
    console.log(`[WebCodecs] Remaining queue size: ${this.encoder.encodeQueueSize}`);

    // Wait for all frames to be encoded with timeout
    const flushPromise = this.encoder.flush();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Encoder flush timeout after 60 seconds')), 60000)
    );

    try {
      console.log('[WebCodecs] Flushing encoder...');
      const startTime = Date.now();
      await Promise.race([flushPromise, timeoutPromise]);
      const elapsed = Date.now() - startTime;
      console.log(`[WebCodecs] Flush complete in ${elapsed}ms`);
    } catch (e) {
      console.error('[WebCodecs] Flush failed:', e);
      this.close();
      throw e;
    }

    console.log(`[WebCodecs] Total encoded: ${this.encodedCount} frames`);
    console.log('[WebCodecs] Finalizing muxer...');

    try {
      this.muxer.finalize();
      console.log('[WebCodecs] Muxer finalized');
    } catch (e) {
      console.error('[WebCodecs] Muxer finalize failed:', e);
      this.close();
      throw e;
    }

    // Get the final video data
    const { buffer } = this.muxer.target;
    console.log(`[WebCodecs] Output buffer size: ${buffer.byteLength} bytes`);

    // Cleanup
    this.encoder.close();
    this.encoder = null;
    this.muxer = null;

    const blob = new Blob([buffer], { type: 'video/mp4' });
    console.log(`[WebCodecs] Final blob size: ${blob.size} bytes`);

    return blob;
  }

  close() {
    console.log('[WebCodecs] Closing encoder...');
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close();
    }
    this.encoder = null;
    this.muxer = null;
  }

  // Get current status for debugging
  getStatus() {
    return {
      frameCount: this.frameCount,
      encodedCount: this.encodedCount,
      queueSize: this.encoder?.encodeQueueSize ?? 0,
      state: this.encoder?.state ?? 'closed',
      error: this.errorOccurred,
    };
  }
}

// Audio encoder using WebCodecs (for future use with AAC)
export async function canEncodeAudio(): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') {
    return false;
  }

  try {
    const config: AudioEncoderConfig = {
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 192000,
    };

    const support = await AudioEncoder.isConfigSupported(config);
    return support.supported ?? false;
  } catch {
    return false;
  }
}
