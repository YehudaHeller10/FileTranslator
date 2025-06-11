class FileHandler {
    constructor() {
        this.files = [];
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.supportedFormats = ['.txt', '.srt', '.vtt', '.csv', '.json'];
        this.chunkSize = 5000;
    }

    setChunkSize(size) {
        this.chunkSize = size;
    }

    isValidFile(file) {
        const extension = '.' + file.name.split('.').pop().toLowerCase();
        return this.supportedFormats.includes(extension) && file.size <= this.maxFileSize;
    }

    async processFiles(fileList) {
        this.files = [];
        const processedFiles = [];

        for (const file of fileList) {
            if (!this.isValidFile(file)) {
                console.warn(`Skipping invalid file: ${file.name}`);
                continue;
            }

            try {
                const content = await this.readFileContent(file);
                const fileData = {
                    name: file.name,
                    size: file.size,
                    type: this.getFileType(file.name),
                    content: content,
                    chunks: this.createChunks(content),
                    originalFile: file
                };

                this.files.push(fileData);
                processedFiles.push(fileData);
            } catch (error) {
                console.error(`Error processing file ${file.name}:`, error);
            }
        }

        return processedFiles;
    }

    async readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    }

    getFileType(filename) {
        const extension = '.' + filename.split('.').pop().toLowerCase();
        const typeMap = {
            '.txt': 'text',
            '.srt': 'subtitle',
            '.vtt': 'subtitle',
            '.csv': 'csv',
            '.json': 'json'
        };
        return typeMap[extension] || 'text';
    }

    createChunks(content) {
        if (content.length <= this.chunkSize) {
            return [{
                index: 0,
                content: content,
                translated: false,
                translation: ''
            }];
        }

        const chunks = [];
        let currentIndex = 0;

        while (currentIndex < content.length) {
            let endIndex = currentIndex + this.chunkSize;
            
            // Try to break at natural boundaries
            if (endIndex < content.length) {
                const nearbyNewline = content.lastIndexOf('\n', endIndex);
                const nearbyPeriod = content.lastIndexOf('.', endIndex);
                const nearbySpace = content.lastIndexOf(' ', endIndex);
                
                // Choose the best break point
                const breakPoint = Math.max(nearbyNewline, nearbyPeriod, nearbySpace);
                if (breakPoint > currentIndex) {
                    endIndex = breakPoint + 1;
                }
            }

            chunks.push({
                index: chunks.length,
                content: content.slice(currentIndex, endIndex),
                translated: false,
                translation: ''
            });

            currentIndex = endIndex;
        }

        return chunks;
    }

    getPreviewText(content, maxLength = 300) {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + '...';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    combineTranslatedChunks(fileData) {
        return fileData.chunks
            .sort((a, b) => a.index - b.index)
            .map(chunk => chunk.translation || chunk.content)
            .join('');
    }

    generateDownloadData(fileData, translatedContent) {
        const extension = '.' + fileData.name.split('.').pop().toLowerCase();
        let processedContent = translatedContent;

        // Format based on file type
        switch (fileData.type) {
            case 'subtitle':
                if (extension === '.srt') {
                    processedContent = this.formatSRT(translatedContent, fileData.content);
                } else if (extension === '.vtt') {
                    processedContent = this.formatVTT(translatedContent, fileData.content);
                }
                break;
            case 'csv':
                processedContent = this.formatCSV(translatedContent, fileData.content);
                break;
            case 'json':
                try {
                    const originalJson = JSON.parse(fileData.content);
                    const translatedJson = JSON.parse(translatedContent);
                    processedContent = JSON.stringify(translatedJson, null, 2);
                } catch (e) {
                    console.warn('JSON formatting failed, using raw translation');
                }
                break;
        }

        return {
            content: processedContent,
            filename: this.generateTranslatedFilename(fileData.name),
            mimeType: this.getMimeType(extension)
        };
    }

    formatSRT(translatedContent, originalContent) {
        const originalLines = originalContent.split('\n');
        const translatedLines = translatedContent.split('\n');
        const formatted = [];
        
        let i = 0;
        while (i < originalLines.length) {
            const line = originalLines[i].trim();
            
            // Check if it's a subtitle number
            if (/^\d+$/.test(line)) {
                formatted.push(line);
                i++;
                
                // Add timestamp if exists
                if (i < originalLines.length && originalLines[i].includes('-->')) {
                    formatted.push(originalLines[i]);
                    i++;
                    
                    // Add translated text
                    const textLines = [];
                    while (i < originalLines.length && originalLines[i].trim() !== '') {
                        textLines.push(originalLines[i]);
                        i++;
                    }
                    
                    // Find corresponding translation
                    const translatedTextIndex = Math.min(formatted.length - textLines.length, translatedLines.length - 1);
                    if (translatedTextIndex >= 0 && translatedLines[translatedTextIndex]) {
                        formatted.push(translatedLines[translatedTextIndex]);
                    } else {
                        formatted.push(...textLines);
                    }
                    
                    formatted.push(''); // Empty line separator
                }
            }
            i++;
        }
        
        return formatted.join('\n');
    }

    formatVTT(translatedContent, originalContent) {
        const lines = originalContent.split('\n');
        const translatedLines = translatedContent.split('\n');
        const formatted = ['WEBVTT', ''];
        
        let translationIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes('-->')) {
                formatted.push(line);
                i++;
                
                // Skip original text and add translation
                while (i < lines.length && lines[i].trim() !== '') {
                    i++;
                }
                
                if (translationIndex < translatedLines.length) {
                    formatted.push(translatedLines[translationIndex]);
                    translationIndex++;
                }
                
                formatted.push('');
            } else if (line.startsWith('NOTE') || line.startsWith('STYLE')) {
                formatted.push(line);
            }
        }
        
        return formatted.join('\n');
    }

    formatCSV(translatedContent, originalContent) {
        // Simple CSV handling - translate content while preserving structure
        const originalLines = originalContent.split('\n');
        const translatedLines = translatedContent.split('\n');
        
        if (originalLines.length === 0) return translatedContent;
        
        // Keep header row if it exists
        const formatted = [originalLines[0]];
        
        for (let i = 1; i < originalLines.length && i <= translatedLines.length; i++) {
            formatted.push(translatedLines[i - 1] || originalLines[i]);
        }
        
        return formatted.join('\n');
    }

    generateTranslatedFilename(originalName) {
        const nameParts = originalName.split('.');
        const extension = nameParts.pop();
        const baseName = nameParts.join('.');
        return `${baseName}_translated.${extension}`;
    }

    getMimeType(extension) {
        const mimeTypes = {
            '.txt': 'text/plain',
            '.srt': 'text/plain',
            '.vtt': 'text/vtt',
            '.csv': 'text/csv',
            '.json': 'application/json'
        };
        return mimeTypes[extension] || 'text/plain';
    }

    downloadFile(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadAllFiles(translatedFiles) {
        if (translatedFiles.length === 1) {
            const file = translatedFiles[0];
            this.downloadFile(file.content, file.filename, file.mimeType);
            return;
        }

        // Create ZIP-like structure for multiple files
        const allContent = translatedFiles.map(file => 
            `=== ${file.filename} ===\n${file.content}\n\n`
        ).join('');
        
        this.downloadFile(allContent, 'translated_files.txt', 'text/plain');
    }

    clearFiles() {
        this.files = [];
    }

    getFiles() {
        return this.files;
    }

    getTotalChunks() {
        return this.files.reduce((total, file) => total + file.chunks.length, 0);
    }

    getTranslatedChunks() {
        return this.files.reduce((total, file) => 
            total + file.chunks.filter(chunk => chunk.translated).length, 0
        );
    }
}