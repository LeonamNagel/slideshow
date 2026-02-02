import type { ExportProgress } from '../hooks/useVideoExport';
import '../styles/ExportModal.css';

interface ExportModalProps {
  isOpen: boolean;
  progress: ExportProgress;
  onCancel: () => void;
  onClose: () => void;
}

export function ExportModal({ isOpen, progress, onCancel, onClose }: ExportModalProps) {
  if (!isOpen) return null;

  const isCompleted = progress.stage === 'done';
  const isError = progress.stage === 'error';
  const canClose = isCompleted || isError;

  const getStageIcon = () => {
    switch (progress.stage) {
      case 'loading':
        return '⏳';
      case 'preparing':
        return '📷';
      case 'rendering':
        return '🎬';
      case 'encoding':
        return '⚙️';
      case 'muxing':
        return '📦';
      case 'done':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📹';
    }
  };

  const getStageName = () => {
    switch (progress.stage) {
      case 'loading':
        return 'Carregando';
      case 'preparing':
        return 'Preparando';
      case 'rendering':
        return 'Renderizando';
      case 'encoding':
        return 'Codificando';
      case 'muxing':
        return 'Finalizando';
      case 'done':
        return 'Concluido';
      case 'error':
        return 'Erro';
      default:
        return '';
    }
  };

  const getEncoderBadge = () => {
    if (!progress.encoder) return null;

    switch (progress.encoder) {
      case 'webcodecs-hardware':
        return { label: 'GPU', className: 'encoder-badge gpu' };
      case 'webcodecs-software':
        return { label: 'WebCodecs', className: 'encoder-badge webcodecs' };
      case 'ffmpeg':
        return { label: 'FFmpeg', className: 'encoder-badge ffmpeg' };
      default:
        return null;
    }
  };

  const encoderBadge = getEncoderBadge();

  return (
    <div className="export-modal-overlay">
      <div className="export-modal">
        <div className="export-modal-header">
          <span className="export-icon">{getStageIcon()}</span>
          <div className="export-title-row">
            <h2>Exportando Video</h2>
            {encoderBadge && (
              <span className={encoderBadge.className}>{encoderBadge.label}</span>
            )}
          </div>
        </div>

        <div className="export-modal-content">
          <div className="export-stage">
            <span className="stage-label">{getStageName()}</span>
            <span className="stage-progress">{Math.round(progress.progress)}%</span>
          </div>

          <div className="export-progress-bar">
            <div
              className={`export-progress-fill ${isError ? 'error' : ''} ${isCompleted ? 'completed' : ''}`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>

          <p className="export-message">{progress.message}</p>

          {progress.currentFrame && progress.totalFrames && (
            <p className="export-frames">
              Frame {progress.currentFrame} de {progress.totalFrames}
              {progress.fps && progress.fps > 0 && (
                <span className="export-fps"> ({progress.fps} fps)</span>
              )}
            </p>
          )}

          {!canClose && (
            <p className="export-warning">
              Nao feche esta janela durante a exportacao.
              <br />
              {progress.encoder === 'ffmpeg'
                ? 'Isso pode levar alguns minutos dependendo do tamanho do slideshow.'
                : 'O processamento com GPU e muito mais rapido!'}
            </p>
          )}
        </div>

        <div className="export-modal-actions">
          {canClose ? (
            <button className="export-btn primary" onClick={onClose}>
              Fechar
            </button>
          ) : (
            <button className="export-btn secondary" onClick={onCancel}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
