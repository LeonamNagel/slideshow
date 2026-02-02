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

    if (softwareSupport.supported) {
      return {
        webcodecs: true,
        hardwareAcceleration: false,
        preferredEncoder: 'webcodecs-software',
      };
    }
  } catch (e) {
    console.warn('WebCodecs detection failed:', e);
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
  private config: WebCodecsConfig;
  private useHardware: boolean;
  private onProgress?: (encoded: number, total: number) => void;

  constructor(config: WebCodecsConfig, useHardware: boolean = true) {
    this.config = config;
    this.useHardware = useHardware;
  }

  setProgressCallback(callback: (encoded: number, total: number) => void) {
    this.onProgress = callback;
  }

  async initialize(): Promise<void> {
    const { width, height, fps, bitrate = 5_000_000 } = this.config;

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

    // Create encoder
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.muxer?.addVideoChunk(chunk, meta);
      },
      error: (e) => {
        console.error('VideoEncoder error:', e);
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
  }

  async encodeFrame(canvas: OffscreenCanvas | HTMLCanvasElement, frameIndex: number, totalFrames: number): Promise<void> {
    if (!this.encoder) throw new Error('Encoder not initialized');

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

    if (this.onProgress && frameIndex % 5 === 0) {
      this.onProgress(frameIndex + 1, totalFrames);
    }
  }

  async finalize(): Promise<Blob> {
    if (!this.encoder || !this.muxer) {
      throw new Error('Encoder not initialized');
    }

    // Wait for all frames to be encoded
    await this.encoder.flush();
    this.muxer.finalize();

    // Get the final video data
    const { buffer } = this.muxer.target;

    // Cleanup
    this.encoder.close();
    this.encoder = null;
    this.muxer = null;

    return new Blob([buffer], { type: 'video/mp4' });
  }

  close() {
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close();
    }
    this.encoder = null;
    this.muxer = null;
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
