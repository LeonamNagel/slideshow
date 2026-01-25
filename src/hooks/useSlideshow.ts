import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Photo, SlideshowSettings, AudioTrack, TransitionEffect } from '../types';

const defaultSettings: SlideshowSettings = {
  photoDuration: 3,
  transitionDuration: 500,
  transitionEffect: 'cinematic',
  autoPlay: true,
  loop: true,
  fitToMusic: false,
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

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
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
  };
}
