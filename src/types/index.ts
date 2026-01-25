export type TransitionEffect =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'flip'
  | 'blur'
  | 'kenburns'
  | 'cinematic'
  | 'gentle-drift'
  | 'breathe';

// Variações do Ken Burns para criar dinamismo
export type KenBurnsVariant =
  | 'zoom-in-left'
  | 'zoom-in-right'
  | 'zoom-out-center'
  | 'zoom-in-top'
  | 'zoom-out-bottom'
  | 'pan-left'
  | 'pan-right'
  | 'drift-diagonal';

export interface Photo {
  id: string;
  file: File;
  url: string;
  name: string;
}

export interface SlideshowSettings {
  photoDuration: number; // em segundos
  transitionDuration: number; // em ms
  transitionEffect: TransitionEffect;
  autoPlay: boolean;
  loop: boolean;
}

export interface AudioTrack {
  file: File;
  url: string;
  name: string;
}
