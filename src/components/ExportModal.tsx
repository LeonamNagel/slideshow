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
      case 'done':
        return 'Concluido';
      case 'error':
        return 'Erro';
      default:
        return '';
    }
  };

  return (
    <div className="export-modal-overlay">
      <div className="export-modal">
        <div className="export-modal-header">
          <span className="export-icon">{getStageIcon()}</span>
          <h2>Exportando Video</h2>
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
            </p>
          )}

          {!canClose && (
            <p className="export-warning">
              Nao feche esta janela durante a exportacao.
              <br />
              Isso pode levar alguns minutos dependendo do tamanho do slideshow.
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
