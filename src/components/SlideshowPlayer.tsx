import { useEffect, useMemo, useRef } from 'react';
import type { RefObject, MutableRefObject } from 'react';
import type { Photo, SlideshowSettings, AudioTrack } from '../types';
import '../styles/SlideshowPlayer.css';

// Ken Burns animation variants for dynamic variety
const KENBURNS_ANIMATIONS = [
  'kenburns-zoom-in-left',
  'kenburns-zoom-in-right',
  'kenburns-zoom-out-center',
  'kenburns-zoom-in-top',
  'kenburns-zoom-out-bottom',
  'kenburns-pan-left',
  'kenburns-pan-right',
  'kenburns-drift-diagonal',
];

const GENTLE_DRIFT_ANIMATIONS = [
  'gentle-float',
  'gentle-float-alt',
  'gentle-sway',
  'gentle-rise',
];

const BREATHE_ANIMATIONS = [
  'breathe-pulse',
  'breathe-pulse-alt',
  'breathe-expand',
  'breathe-contract',
];

interface SlideshowPlayerProps {
  photos: Photo[];
  settings: SlideshowSettings;
  audio: AudioTrack | null;
  currentIndex: number;
  isPlaying: boolean;
  isFullscreen: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  playerContainerRef: MutableRefObject<HTMLDivElement | null>;
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
  playerContainerRef,
  onTogglePlay,
  onPrevSlide,
  onNextSlide,
  onStop,
  onToggleFullscreen,
  onGoToSlide,
}: SlideshowPlayerProps) {
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

  // Generate animation assignments for each photo (memoized to maintain consistency)
  const photoAnimations = useMemo(() => {
    return photos.map((photo, index) => {
      // Use photo id hash + index for deterministic but varied animations
      const hash = photo.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

      return {
        kenburns: KENBURNS_ANIMATIONS[(hash + index) % KENBURNS_ANIMATIONS.length],
        gentleDrift: GENTLE_DRIFT_ANIMATIONS[(hash + index) % GENTLE_DRIFT_ANIMATIONS.length],
        breathe: BREATHE_ANIMATIONS[(hash + index) % BREATHE_ANIMATIONS.length],
      };
    });
  }, [photos]);

  const getTransitionClass = () => {
    return `transition-${settings.transitionEffect}`;
  };

  const getAnimationForSlide = (index: number): string => {
    if (!photoAnimations[index]) return KENBURNS_ANIMATIONS[0];

    switch (settings.transitionEffect) {
      case 'kenburns':
      case 'cinematic':
        return photoAnimations[index].kenburns;
      case 'gentle-drift':
        return photoAnimations[index].gentleDrift;
      case 'breathe':
        return photoAnimations[index].breathe;
      default:
        return KENBURNS_ANIMATIONS[0];
    }
  };

  const isCinematicEffect = ['kenburns', 'cinematic', 'gentle-drift', 'breathe'].includes(
    settings.transitionEffect
  );

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
      ref={playerContainerRef}
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
              '--transition-duration': `${settings.transitionDuration}ms`,
              '--photo-duration': `${settings.photoDuration}s`,
              '--kenburns-animation': isCinematicEffect ? getAnimationForSlide(index) : undefined,
            } as React.CSSProperties}
          >
            <img src={photo.url} alt={photo.name} />
          </div>
        ))}
      </div>

      <div className="player-overlay">
        {/* Top bar with counter */}
        <div className="player-top-bar">
          <div className="slide-counter">
            {currentIndex + 1} / {photos.length}
          </div>
          <button className="control-btn control-btn-small" onClick={onToggleFullscreen} title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}>
            {isFullscreen ? '✕' : '⛶'}
          </button>
        </div>

        {/* Center play button (only when paused) */}
        {!isPlaying && (
          <div className="player-center">
            <button className="control-btn play-btn-large" onClick={onTogglePlay} title="Reproduzir">
              ▶
            </button>
          </div>
        )}

        {/* Bottom controls */}
        <div className="player-bottom-bar">
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
            <button className="control-btn" onClick={onNextSlide} title="Próximo">
              ⏭
            </button>
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
    </div>
  );
}
