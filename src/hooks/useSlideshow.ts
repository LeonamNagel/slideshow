import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Photo, SlideshowSettings, AudioTrack, TransitionEffect } from '../types';

// Helper to detect mobile devices
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
};

const defaultSettings: SlideshowSettings = {
  photoDuration: 3,
  transitionDuration: 500,
  transitionEffect: 'cinematic',
  autoPlay: true,
  loop: true,
  fitToMusic: false,
  blurBackground: true,
};

export function useSlideshow() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [settings, setSettings] = useState<SlideshowSettings>(defaultSettings);
  const [audio, setAudio] = useState<AudioTrack | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const addPhotos = useCallback((files: FileList) => {
    const newPhotos: Photo[] = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        id: uuidv4(),
        file,
        url: URL.createObjectURL(file),
        name: file.name,
      }));

    setPhotos(prev => [...prev, ...newPhotos]);
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.url);
      }
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const reorderPhotos = useCallback((fromIndex: number, toIndex: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      const [removed] = newPhotos.splice(fromIndex, 1);
      newPhotos.splice(toIndex, 0, removed);
      return newPhotos;
    });
  }, []);

  const clearPhotos = useCallback(() => {
    photos.forEach(photo => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setCurrentIndex(0);
  }, [photos]);

  const setAudioTrack = useCallback((file: File | null) => {
    if (audio) {
      URL.revokeObjectURL(audio.url);
    }

    if (file && file.type.startsWith('audio/')) {
      const url = URL.createObjectURL(file);

      // Detectar duração do áudio
      const audioElement = new Audio(url);
      audioElement.addEventListener('loadedmetadata', () => {
        setAudio({
          file,
          url,
          name: file.name,
          duration: audioElement.duration,
        });
      });

      // Fallback caso o evento não dispare
      audioElement.addEventListener('error', () => {
        setAudio({
          file,
          url,
          name: file.name,
          duration: 0,
        });
      });

      audioElement.load();
    } else {
      setAudio(null);
    }
  }, [audio]);

  const updateSettings = useCallback((updates: Partial<SlideshowSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const setTransitionEffect = useCallback((effect: TransitionEffect) => {
    updateSettings({ transitionEffect: effect });
  }, [updateSettings]);

  const goToSlide = useCallback((index: number) => {
    if (photos.length === 0) return;

    let newIndex = index;
    if (settings.loop) {
      newIndex = ((index % photos.length) + photos.length) % photos.length;
    } else {
      newIndex = Math.max(0, Math.min(index, photos.length - 1));
    }
    setCurrentIndex(newIndex);
  }, [photos.length, settings.loop]);

  const nextSlide = useCallback(() => {
    goToSlide(currentIndex + 1);
  }, [currentIndex, goToSlide]);

  const prevSlide = useCallback(() => {
    goToSlide(currentIndex - 1);
  }, [currentIndex, goToSlide]);

  const play = useCallback(() => {
    if (photos.length === 0) return;
    setIsPlaying(true);

    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [photos.length]);

  const pause = useCallback(() => {
    setIsPlaying(false);

    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const stop = useCallback(() => {
    pause();
    setCurrentIndex(0);

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [pause]);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const enterFullscreen = useCallback(async (element: HTMLElement) => {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }

      // Try to lock orientation to landscape on mobile
      if (isMobileDevice() && screen.orientation && 'lock' in screen.orientation) {
        try {
          await (screen.orientation as any).lock('landscape');
        } catch {
          // Orientation lock not supported or denied
        }
      }

      setIsFullscreen(true);
    } catch {
      // Fallback to CSS fullscreen
      setIsFullscreen(true);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }

      // Unlock orientation
      if (screen.orientation && 'unlock' in screen.orientation) {
        try {
          (screen.orientation as any).unlock();
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore errors
    }
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else if (playerContainerRef.current) {
      enterFullscreen(playerContainerRef.current);
    } else {
      setIsFullscreen(prev => !prev);
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Listen for fullscreen changes (user pressing ESC, etc.)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);

      // Unlock orientation when exiting fullscreen
      if (!isCurrentlyFullscreen && screen.orientation && 'unlock' in screen.orientation) {
        try {
          (screen.orientation as any).unlock();
        } catch {
          // Ignore
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Auto-advance slides
  useEffect(() => {
    if (isPlaying && photos.length > 0) {
      timerRef.current = window.setTimeout(() => {
        if (currentIndex >= photos.length - 1 && !settings.loop) {
          pause();
        } else {
          nextSlide();
        }
      }, settings.photoDuration * 1000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPlaying, currentIndex, photos.length, settings.photoDuration, settings.loop, nextSlide, pause]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      photos.forEach(photo => URL.revokeObjectURL(photo.url));
      if (audio) {
        URL.revokeObjectURL(audio.url);
      }
    };
  }, []);

  return {
    // State
    photos,
    settings,
    audio,
    currentIndex,
    isPlaying,
    isFullscreen,
    audioRef,
    playerContainerRef,

    // Photo actions
    addPhotos,
    removePhoto,
    reorderPhotos,
    clearPhotos,

    // Audio actions
    setAudioTrack,

    // Settings actions
    updateSettings,
    setTransitionEffect,

    // Playback actions
    goToSlide,
    nextSlide,
    prevSlide,
    play,
    pause,
    togglePlay,
    stop,
    toggleFullscreen,
    enterFullscreen,
    exitFullscreen,
  };
}
