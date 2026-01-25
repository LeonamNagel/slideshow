import { useState } from 'react';
import { useSlideshow } from './hooks/useSlideshow';
import { useVideoExport } from './hooks/useVideoExport';
import { PhotoUpload } from './components/PhotoUpload';
import { Controls } from './components/Controls';
import { SlideshowPlayer } from './components/SlideshowPlayer';
import { ExportModal } from './components/ExportModal';
import './App.css';

function App() {
  const slideshow = useSlideshow();
  const videoExport = useVideoExport();
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExport = async () => {
    setShowExportModal(true);
    const blob = await videoExport.exportVideo(
      slideshow.photos,
      slideshow.settings,
      slideshow.audio
    );

    if (blob) {
      videoExport.downloadVideo(blob);
    }
  };

  const handleCloseExportModal = () => {
    setShowExportModal(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Slideshow Maker</h1>
        <p>Crie apresentacoes de fotos incriveis</p>
      </header>

      <main className="app-main">
        <div className="player-section">
          <SlideshowPlayer
            photos={slideshow.photos}
            settings={slideshow.settings}
            audio={slideshow.audio}
            currentIndex={slideshow.currentIndex}
            isPlaying={slideshow.isPlaying}
            isFullscreen={slideshow.isFullscreen}
            audioRef={slideshow.audioRef}
            onTogglePlay={slideshow.togglePlay}
            onPrevSlide={slideshow.prevSlide}
            onNextSlide={slideshow.nextSlide}
            onStop={slideshow.stop}
            onToggleFullscreen={slideshow.toggleFullscreen}
            onGoToSlide={slideshow.goToSlide}
          />
        </div>

        <aside className="control-panel">
          <PhotoUpload
            photos={slideshow.photos}
            onAddPhotos={slideshow.addPhotos}
            onRemovePhoto={slideshow.removePhoto}
            onReorderPhotos={slideshow.reorderPhotos}
            onClearPhotos={slideshow.clearPhotos}
          />

          <Controls
            settings={slideshow.settings}
            audio={slideshow.audio}
            photosCount={slideshow.photos.length}
            isExporting={videoExport.isExporting}
            onUpdateSettings={slideshow.updateSettings}
            onSetAudio={slideshow.setAudioTrack}
            onExport={handleExport}
          />
        </aside>
      </main>

      <ExportModal
        isOpen={showExportModal}
        progress={videoExport.progress}
        onCancel={videoExport.cancelExport}
        onClose={handleCloseExportModal}
      />
    </div>
  );
}

export default App;
