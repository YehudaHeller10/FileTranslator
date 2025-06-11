// Application State
let fileHandler = null;
let translator = null;
let currentFiles = [];
let isTranslating = false;

// DOM Elements
const elements = {
    dropZone: null,
    fileInput: null,
    filePreview: null,
    fileList: null,
    translateBtn: null,
    translationProgress: null,
    translationResults: null,
    sourceLanguage: null,
    targetLanguage: null,
    chunkSize: null,
    chunkSizeValue: null,
    historyList: null,
    loadingOverlay: null,
    previewModal: null,
    previewContent: null,
    closeModal: null,
    clearFiles: null,
    downloadAll: null,
    previewResults: null,
    progressText: null,
    progressPercent: null,
    progressFill: null,
    progressDetails: null,
    resultsList: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    initializeHandlers();
    setupEventListeners();
    updateChunkSizeDisplay();
    loadTranslationHistory();
});

function initializeElements() {
    // Get all DOM elements
    Object.keys(elements).forEach(key => {
        const element = document.getElementById(key);
        if (element) {
            elements[key] = element;
        } else {
            console.warn(`Element not found: ${key}`);
        }
    });
}

function initializeHandlers() {
    fileHandler = new FileHandler();
    translator = new Translator();
}

function setupEventListeners() {
    // File upload events
    if (elements.dropZone) {
        elements.dropZone.addEventListener('click', () => elements.fileInput?.click());
        elements.dropZone.addEventListener('dragover', handleDragOver);
        elements.dropZone.addEventListener('dragleave', handleDragLeave);
        elements.dropZone.addEventListener('drop', handleDrop);
    }

    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleFileSelect);
    }

    // Translation controls
    if (elements.translateBtn) {
        elements.translateBtn.addEventListener('click', startTranslation);
    }

    if (elements.clearFiles) {
        elements.clearFiles.addEventListener('click', clearAllFiles);
    }

    // Results actions
    if (elements.downloadAll) {
        elements.downloadAll.addEventListener('click', downloadAllFiles);
    }

    if (elements.previewResults) {
        elements.previewResults.addEventListener('click', previewAllResults);
    }

    // Chunk size slider
    if (elements.chunkSize) {
        elements.chunkSize.addEventListener('input', updateChunkSizeDisplay);
    }

    // Modal controls
    if (elements.closeModal) {
        elements.closeModal.addEventListener('click', closeModal);
    }

    if (elements.previewModal) {
        elements.previewModal.addEventListener('click', (e) => {
            if (e.target === elements.previewModal) {
                closeModal();
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

// File Upload Handlers
function handleDragOver(e) {
    e.preventDefault();
    elements.dropZone?.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    elements.dropZone?.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropZone?.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    processSelectedFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    processSelectedFiles(files);
}

async function processSelectedFiles(files) {
    if (!files.length) return;

    showLoading();
    
    try {
        const processedFiles = await fileHandler.processFiles(files);
        currentFiles = processedFiles;
        
        if (processedFiles.length > 0) {
            displayFilePreview(processedFiles);
            enableTranslationButton();
        } else {
            showNotification('No valid files selected', 'error');
        }
    } catch (error) {
        console.error('Error processing files:', error);
        showNotification('Error processing files', 'error');
    } finally {
        hideLoading();
    }
}

function displayFilePreview(files) {
    if (!elements.filePreview || !elements.fileList) return;

    elements.fileList.innerHTML = '';
    
    files.forEach((file, index) => {
        const fileItem = createFilePreviewItem(file, index);
        elements.fileList.appendChild(fileItem);
    });

    elements.filePreview.classList.remove('hidden');
}

function createFilePreviewItem(file, index) {
    const div = document.createElement('div');
    div.className = 'file-item';
    
    const previewText = fileHandler.getPreviewText(file.content);
    
    div.innerHTML = `
        <div class="file-header">
            <span class="file-name">${file.name}</span>
            <span class="file-size">${fileHandler.formatFileSize(file.size)}</span>
        </div>
        <div class="file-info">
            <span class="file-type">${file.type.toUpperCase()}</span>
            <span class="chunk-count">${file.chunks.length} chunks</span>
        </div>
        <div class="file-preview-text">${previewText}</div>
        <div class="file-actions">
            <button class="btn-secondary" onclick="previewFile(${index})">
                <span class="btn-icon">👁️</span>
                Preview
            </button>
            <button class="btn-secondary" onclick="removeFile(${index})">
                <span class="btn-icon">🗑️</span>
                Remove
            </button>
        </div>
    `;
    
    return div;
}

function previewFile(index) {
    const file = currentFiles[index];
    if (!file) return;

    elements.previewContent.textContent = file.content;
    elements.previewModal.classList.remove('hidden');
}

function removeFile(index) {
    currentFiles.splice(index, 1);
    
    if (currentFiles.length === 0) {
        clearAllFiles();
    } else {
        displayFilePreview(currentFiles);
    }
}

function clearAllFiles() {
    currentFiles = [];
    fileHandler.clearFiles();
    
    if (elements.filePreview) {
        elements.filePreview.classList.add('hidden');
    }
    
    if (elements.translationResults) {
        elements.translationResults.classList.add('hidden');
    }
    
    if (elements.translationProgress) {
        elements.translationProgress.classList.add('hidden');
    }
    
    disableTranslationButton();
    
    if (elements.fileInput) {
        elements.fileInput.value = '';
    }
}

// Translation Process
async function startTranslation() {
    if (isTranslating || currentFiles.length === 0) return;

    isTranslating = true;
    const sourceLang = elements.sourceLanguage?.value || 'auto';
    const targetLang = elements.targetLanguage?.value || 'en';
    
    // Update chunk size
    const chunkSize = parseInt(elements.chunkSize?.value || '5000');
    fileHandler.setChunkSize(chunkSize);
    
    // Re-chunk files with new size if needed
    currentFiles.forEach(file => {
        file.chunks = fileHandler.createChunks(file.content);
    });

    try {
        showTranslationProgress();
        disableTranslationButton();
        
        await translator.translateAllFiles(
            currentFiles,
            sourceLang,
            targetLang,
            updateTranslationProgress,
            onFileTranslationComplete
        );
        
        showTranslationResults();
        
    } catch (error) {
        console.error('Translation failed:', error);
        showNotification('Translation failed. Please try again.', 'error');
    } finally {
        isTranslating = false;
        enableTranslationButton();
        hideTranslationProgress();
        loadTranslationHistory();
    }
}

function showTranslationProgress() {
    if (!elements.translationProgress) return;
    
    elements.translationProgress.classList.remove('hidden');
    updateProgressDisplay(0, 'Starting translation...');
}

function hideTranslationProgress() {
    if (!elements.translationProgress) {
        return;
    }
    
    setTimeout(() => {
        elements.translationProgress.classList.add('hidden');
    }, 1000);
}

function updateTranslationProgress(progress) {
    const percentage = Math.round(progress.overallProgress * 100);
    const currentFile = `${progress.fileIndex + 1}/${progress.totalFiles}`;
    const status = `Translating ${progress.fileName} (${currentFile})`;
    
    updateProgressDisplay(percentage, status);
    
    if (elements.progressDetails) {
        elements.progressDetails.textContent = 
            `Processing chunk ${Math.round(progress.fileProgress * 100)}% of current file`;
    }
}

function updateProgressDisplay(percentage, text) {
    if (elements.progressFill) {
        elements.progressFill.style.width = `${percentage}%`;
    }
    
    if (elements.progressPercent) {
        elements.progressPercent.textContent = `${percentage}%`;
    }
    
    if (elements.progressText) {
        elements.progressText.textContent = text;
    }
}

function onFileTranslationComplete(file) {
    console.log(`Translation completed for: ${file.name}`);
}

function showTranslationResults() {
    if (!elements.translationResults || !elements.resultsList) return;

    elements.resultsList.innerHTML = '';
    
    currentFiles.forEach((file, index) => {
        const resultItem = createResultItem(file, index);
        elements.resultsList.appendChild(resultItem);
    });
    
    elements.translationResults.classList.remove('hidden');
}

function createResultItem(file, index) {
    const div = document.createElement('div');
    div.className = 'result-item';
    
    const translatedContent = fileHandler.combineTranslatedChunks(file);
    const translatedSize = new Blob([translatedContent]).size;
    
    div.innerHTML = `
        <div class="result-header">
            <span class="file-name">${file.name}</span>
            <span class="result-status">✅ Translated</span>
        </div>
        <div class="result-info">
            <span>Original: ${fileHandler.formatFileSize(file.size)}</span>
            <span>Translated: ${fileHandler.formatFileSize(translatedSize)}</span>
            <span>${file.chunks.length} chunks processed</span>
        </div>
        <div class="result-actions">
            <button class="btn-primary" onclick="downloadFile(${index})">
                <span class="btn-icon">⬇️</span>
                Download
            </button>
            <button class="btn-secondary" onclick="previewTranslation(${index})">
                <span class="btn-icon">👁️</span>
                Preview
            </button>
        </div>
    `;
    
    return div;
}

function downloadFile(index) {
    const file = currentFiles[index];
    if (!file) return;

    const translatedContent = fileHandler.combineTranslatedChunks(file);
    const downloadData = fileHandler.generateDownloadData(file, translatedContent);
    
    fileHandler.downloadFile(
        downloadData.content,
        downloadData.filename,
        downloadData.mimeType
    );
}

function downloadAllFiles() {
    if (currentFiles.length === 0) return;

    const translatedFiles = currentFiles.map(file => {
        const translatedContent = fileHandler.combineTranslatedChunks(file);
        return fileHandler.generateDownloadData(file, translatedContent);
    });
    
    fileHandler.downloadAllFiles(translatedFiles);
}

function previewTranslation(index) {
    const file = currentFiles[index];
    if (!file) return;

    const translatedContent = fileHandler.combineTranslatedChunks(file);
    elements.previewContent.textContent = translatedContent;
    elements.previewModal.classList.remove('hidden');
}

function previewAllResults() {
    if (currentFiles.length === 0) return;

    const allTranslations = currentFiles.map(file => {
        const translatedContent = fileHandler.combineTranslatedChunks(file);
        return `=== ${file.name} ===\n${translatedContent}\n\n`;
    }).join('');
    
    elements.previewContent.textContent = allTranslations;
    elements.previewModal.classList.remove('hidden');
}

// UI Helper Functions
function enableTranslationButton() {
    if (elements.translateBtn) {
        elements.translateBtn.disabled = false;
        elements.translateBtn.innerHTML = `
            <span class="btn-icon">🌍</span>
            Start Translation
        `;
    }
}

function disableTranslationButton() {
    if (elements.translateBtn) {
        elements.translateBtn.disabled = true;
        elements.translateBtn.innerHTML = `
            <span class="btn-icon">⏳</span>
            Translating...
        `;
    }
}

function updateChunkSizeDisplay() {
    if (elements.chunkSize && elements.chunkSizeValue) {
        const value = elements.chunkSize.value;
        elements.chunkSizeValue.textContent = value;
        
        if (fileHandler) {
            fileHandler.setChunkSize(parseInt(value));
        }
    }
}

function showLoading() {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.classList.remove('hidden');
    }
}

function hideLoading() {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function closeModal() {
    if (elements.previewModal) {
        elements.previewModal.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? 'var(--error-red)' : 'var(--success-green)'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: var(--shadow-card);
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Translation History
function loadTranslationHistory() {
    if (!elements.historyList || !translator) return;

    const history = translator.getHistory();
    elements.historyList.innerHTML = '';
    
    if (history.length === 0) {
        elements.historyList.innerHTML = '<p class="empty-state">No translations yet</p>';
        return;
    }
    
    history.forEach(entry => {
        const historyItem = createHistoryItem(entry);
        elements.historyList.appendChild(historyItem);
    });
}

function createHistoryItem(entry) {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    const date = new Date(entry.timestamp).toLocaleDateString();
    const time = new Date(entry.timestamp).toLocaleTimeString();
    
    div.innerHTML = `
        <h4>${entry.fileName}</h4>
        <p>${entry.sourceLang} → ${entry.targetLang}</p>
        <p>${date} ${time}</p>
        <p>${entry.chunkCount} chunks, ${entry.duration}s</p>
    `;
    
    return div;
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    showNotification('An unexpected error occurred', 'error');
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    showNotification('An unexpected error occurred', 'error');
});

// Expose functions to global scope for onclick handlers
window.previewFile = previewFile;
window.removeFile = removeFile;
window.downloadFile = downloadFile;
window.previewTranslation = previewTranslation;