export type TransitionEffect =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'flip'
  | 'blur';

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
