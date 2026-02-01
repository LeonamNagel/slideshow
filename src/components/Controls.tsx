import { useRef, useState } from 'react';
import type { SlideshowSettings, TransitionEffect, AudioTrack } from '../types';
import type { ExportQuality } from '../hooks/useVideoExport';
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

const QUALITY_OPTIONS: { value: ExportQuality; label: string; description: string }[] = [
  { value: 'fast', label: 'Rapido', description: '720p 24fps - Exportacao rapida' },
  { value: 'medium', label: 'Medio', description: '1080p 30fps - Balanceado' },
  { value: 'high', label: 'Alta', description: '1080p 30fps - Melhor qualidade' },
];

interface ControlsProps {
  settings: SlideshowSettings;
  audio: AudioTrack | null;
  photosCount: number;
  isExporting: boolean;
  onUpdateSettings: (updates: Partial<SlideshowSettings>) => void;
  onSetAudio: (file: File | null) => void;
  onExport: (quality: ExportQuality) => void;
}

export function Controls({
  settings,
  audio,
  photosCount,
  isExporting,
  onUpdateSettings,
  onSetAudio,
  onExport,
}: ControlsProps) {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [exportQuality, setExportQuality] = useState<ExportQuality>('medium');

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSetAudio(e.target.files[0]);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const baseDuration = photosCount * settings.photoDuration;
  const estimatedDuration = settings.fitToMusic && audio?.duration
    ? audio.duration
    : baseDuration;

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
              {audio.duration > 0 && (
                <span className="audio-duration">
                  {formatDuration(audio.duration)}
                </span>
              )}
              <button
                className="remove-audio-btn"
                onClick={() => onSetAudio(null)}
              >
                &times;
              </button>
            </div>
          )}
          {audio && audio.duration > 0 && (
            <label className="fit-to-music-label">
              <input
                type="checkbox"
                checked={settings.fitToMusic}
                onChange={(e) => onUpdateSettings({ fitToMusic: e.target.checked })}
              />
              Repetir fotos ate o fim da musica
            </label>
          )}
        </div>
      </div>

      <div className="control-group export-section">
        <label htmlFor="export-quality">Qualidade da Exportacao</label>
        <select
          id="export-quality"
          value={exportQuality}
          onChange={(e) => setExportQuality(e.target.value as ExportQuality)}
          disabled={isExporting}
        >
          {QUALITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} - {option.description}
            </option>
          ))}
        </select>

        <div className="export-info">
          {photosCount > 0 && (
            <span className="export-duration">
              Duracao estimada: {formatDuration(estimatedDuration)}
            </span>
          )}
        </div>
        <button
          className="export-btn"
          onClick={() => onExport(exportQuality)}
          disabled={photosCount === 0 || isExporting}
        >
          {isExporting ? 'Exportando...' : 'Exportar MP4'}
        </button>
      </div>
    </div>
  );
}
