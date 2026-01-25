import { useRef } from 'react';
import type { SlideshowSettings, TransitionEffect, AudioTrack } from '../types';
import '../styles/Controls.css';

const TRANSITION_OPTIONS: { value: TransitionEffect; label: string; description?: string }[] = [
  // Efeitos Cinematograficos (recomendados)
  { value: 'cinematic', label: 'Cinematico', description: 'Ken Burns com variacoes automaticas' },
  { value: 'kenburns', label: 'Ken Burns', description: 'Zoom e pan suave estilo documentario' },
  { value: 'gentle-drift', label: 'Flutuante', description: 'Movimento sutil e delicado' },
  { value: 'breathe', label: 'Respiracao', description: 'Zoom pulsante suave' },
  // Efeitos Basicos
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Deslizar Esquerda' },
  { value: 'slide-right', label: 'Deslizar Direita' },
  { value: 'slide-up', label: 'Deslizar Cima' },
  { value: 'slide-down', label: 'Deslizar Baixo' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
  { value: 'flip', label: 'Virar' },
  { value: 'blur', label: 'Blur' },
];

interface ControlsProps {
  settings: SlideshowSettings;
  audio: AudioTrack | null;
  onUpdateSettings: (updates: Partial<SlideshowSettings>) => void;
  onSetAudio: (file: File | null) => void;
}

export function Controls({
  settings,
  audio,
  onUpdateSettings,
  onSetAudio,
}: ControlsProps) {
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSetAudio(e.target.files[0]);
    }
  };

  return (
    <div className="controls">
      <h3>Configuracoes</h3>

      <div className="control-group">
        <label htmlFor="photo-duration">
          Duracao de cada foto: <strong>{settings.photoDuration}s</strong>
        </label>
        <input
          id="photo-duration"
          type="range"
          min="1"
          max="10"
          step="0.5"
          value={settings.photoDuration}
          onChange={(e) =>
            onUpdateSettings({ photoDuration: parseFloat(e.target.value) })
          }
        />
      </div>

      <div className="control-group">
        <label htmlFor="transition-duration">
          Duracao da transicao: <strong>{settings.transitionDuration}ms</strong>
        </label>
        <input
          id="transition-duration"
          type="range"
          min="200"
          max="1500"
          step="100"
          value={settings.transitionDuration}
          onChange={(e) =>
            onUpdateSettings({ transitionDuration: parseInt(e.target.value) })
          }
        />
      </div>

      <div className="control-group">
        <label htmlFor="transition-effect">Efeito de Transicao</label>
        <select
          id="transition-effect"
          value={settings.transitionEffect}
          onChange={(e) =>
            onUpdateSettings({
              transitionEffect: e.target.value as TransitionEffect,
            })
          }
        >
          {TRANSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="control-group checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={settings.loop}
            onChange={(e) => onUpdateSettings({ loop: e.target.checked })}
          />
          Repetir slideshow
        </label>
      </div>

      <div className="control-group">
        <label>Musica de Fundo</label>
        <div className="audio-controls">
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioSelect}
            hidden
          />
          <button
            className="audio-btn"
            onClick={() => audioInputRef.current?.click()}
          >
            {audio ? 'Trocar Musica' : 'Adicionar Musica'}
          </button>
          {audio && (
            <div className="audio-info">
              <span className="audio-name" title={audio.name}>
                {audio.name}
              </span>
              <button
                className="remove-audio-btn"
                onClick={() => onSetAudio(null)}
              >
                &times;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
