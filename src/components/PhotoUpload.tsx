import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { Photo } from '../types';
import '../styles/PhotoUpload.css';

interface PhotoUploadProps {
  photos: Photo[];
  onAddPhotos: (files: FileList) => void;
  onRemovePhoto: (id: string) => void;
  onReorderPhotos: (fromIndex: number, toIndex: number) => void;
  onClearPhotos: () => void;
}

export function PhotoUpload({
  photos,
  onAddPhotos,
  onRemovePhoto,
  onReorderPhotos,
  onClearPhotos,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddPhotos(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddPhotos(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handlePhotoDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handlePhotoDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorderPhotos(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const handlePhotoDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="photo-upload">
      <div className="upload-header">
        <h3>Fotos ({photos.length})</h3>
        {photos.length > 0 && (
          <button className="clear-btn" onClick={onClearPhotos}>
            Limpar Todas
          </button>
        )}
      </div>

      <div
        className={`dropzone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          hidden
        />
        <div className="dropzone-content">
          <span className="dropzone-icon">+</span>
          <p>Arraste fotos aqui ou clique para selecionar</p>
          <span className="dropzone-hint">Suporta JPG, PNG, GIF, WebP</span>
        </div>
      </div>

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className={`photo-item ${draggedIndex === index ? 'dragging' : ''}`}
              draggable
              onDragStart={() => handlePhotoDragStart(index)}
              onDragOver={(e) => handlePhotoDragOver(e, index)}
              onDragEnd={handlePhotoDragEnd}
            >
              <img src={photo.url} alt={photo.name} />
              <div className="photo-overlay">
                <span className="photo-number">{index + 1}</span>
                <button
                  className="remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePhoto(photo.id);
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
