import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Photo, SlideshowSettings, AudioTrack } from '../types';
import '../styles/SlideshowPlayer.css';

interface SlideshowPlayerProps {
  photos: Photo[];
  settings: SlideshowSettings;
  audio: AudioTrack | null;
  currentIndex: number;
  isPlaying: boolean;
  isFullscreen: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  onTogglePlay: () => void;
  onPrevSlide: () => void;
  onNextSlide: () => void;
  onStop: () => void;
  onToggleFullscreen: () => void;
  onGoToSlide: (index: number) => void;
}

export function SlideshowPlayer({
  photos,
  settings,
  audio,
  currentIndex,
  isPlaying,
  isFullscreen,
  audioRef,
  onTogglePlay,
  onPrevSlide,
  onNextSlide,
  onStop,
  onToggleFullscreen,
  onGoToSlide,
}: SlideshowPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevIndexRef = useRef(currentIndex);

  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        onToggleFullscreen();
      } else if (e.key === ' ') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === 'ArrowLeft') {
        onPrevSlide();
      } else if (e.key === 'ArrowRight') {
        onNextSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onToggleFullscreen, onTogglePlay, onPrevSlide, onNextSlide]);

  const getTransitionClass = () => {
    return `transition-${settings.transitionEffect}`;
  };

  if (photos.length === 0) {
    return (
      <div className="slideshow-player empty">
        <div className="empty-message">
          <span className="empty-icon">📷</span>
          <p>Adicione fotos para iniciar o slideshow</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`slideshow-player ${isFullscreen ? 'fullscreen' : ''}`}
    >
      {audio && (
        <audio ref={audioRef} src={audio.url} loop preload="auto" />
      )}

      <div className="slides-container">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className={`slide ${getTransitionClass()} ${
              index === currentIndex ? 'active' : ''
            } ${index === prevIndexRef.current && index !== currentIndex ? 'prev' : ''}`}
            style={{
              transitionDuration: `${settings.transitionDuration}ms`,
            }}
          >
            <img src={photo.url} alt={photo.name} />
          </div>
        ))}
      </div>

      <div className="player-overlay">
        <div className="progress-bar">
          <div
            className="progress"
            style={{
              animationDuration: isPlaying ? `${settings.photoDuration}s` : '0s',
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
            key={`${currentIndex}-${isPlaying}`}
          />
        </div>

        <div className="player-controls">
          <button className="control-btn" onClick={onPrevSlide} title="Anterior">
            ⏮
          </button>
          <button className="control-btn" onClick={onStop} title="Parar">
            ⏹
          </button>
          <button className="control-btn play-btn" onClick={onTogglePlay} title={isPlaying ? 'Pausar' : 'Reproduzir'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="control-btn" onClick={onNextSlide} title="Proximo">
            ⏭
          </button>
          <button className="control-btn" onClick={onToggleFullscreen} title="Tela Cheia">
            {isFullscreen ? '⛶' : '⛶'}
          </button>
        </div>

        <div className="slide-counter">
          {currentIndex + 1} / {photos.length}
        </div>

        <div className="thumbnail-strip">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              className={`thumbnail ${index === currentIndex ? 'active' : ''}`}
              onClick={() => onGoToSlide(index)}
            >
              <img src={photo.url} alt={photo.name} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
