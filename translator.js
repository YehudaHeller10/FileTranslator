class Translator {
    constructor() {
        this.rateLimitDelay = 500; // 500ms between requests
        this.maxRetries = 3;
        this.translationHistory = this.loadHistory();
        this.cache = new Map();
    }

    async translateText(text, sourceLang, targetLang) {
        if (!text || !text.trim()) {
            return text;
        }

        // Check cache first
        const cacheKey = this.getCacheKey(text, sourceLang, targetLang);
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const cached = this.getFromCache(cacheKey);
        if (cached) {
            this.cache.set(cacheKey, cached);
            return cached;
        }

        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                const translation = await this.translateWithGoogleWeb(text, sourceLang, targetLang);
                
                // Cache the result
                this.cache.set(cacheKey, translation);
                this.saveToCache(cacheKey, translation);
                
                // Add delay to be respectful
                await this.delay(this.rateLimitDelay);
                
                return translation;
            } catch (error) {
                retries++;
                console.warn(`Translation attempt ${retries} failed:`, error.message);
                
                if (retries >= this.maxRetries) {
                    console.error('Max retries reached, using fallback translation');
                    const fallback = await this.fallbackTranslation(text, sourceLang, targetLang);
                    return fallback;
                }
                
                // Exponential backoff
                await this.delay(this.rateLimitDelay * Math.pow(2, retries));
            }
        }
        
        return text;
    }

    async translateWithGoogleWeb(text, sourceLang, targetLang) {
        // Use Google Translate's web interface through a proxy approach
        const cleanText = text.substring(0, 5000).trim(); // Limit text length
        
        try {
            // Method 1: Use Google Translate widget approach
            const translation = await this.googleTranslateWidget(cleanText, sourceLang, targetLang);
            if (translation && translation !== cleanText) {
                return translation;
            }
        } catch (error) {
            console.warn('Google Translate widget failed:', error);
        }

        try {
            // Method 2: Use LibreTranslate public instance
            const translation = await this.libreTranslatePublic(cleanText, sourceLang, targetLang);
            if (translation && translation !== cleanText) {
                return translation;
            }
        } catch (error) {
            console.warn('LibreTranslate public failed:', error);
        }

        try {
            // Method 3: Use Lingva Translate (Google Translate proxy)
            const translation = await this.lingvaTranslate(cleanText, sourceLang, targetLang);
            if (translation && translation !== cleanText) {
                return translation;
            }
        } catch (error) {
            console.warn('Lingva Translate failed:', error);
        }

        // If all methods fail, use fallback
        return await this.fallbackTranslation(cleanText, sourceLang, targetLang);
    }

    async googleTranslateWidget(text, sourceLang, targetLang) {
        // This method uses Google Translate's widget API
        const url = 'https://translate.googleapis.com/translate_a/single';
        const params = new URLSearchParams({
            client: 'gtx',
            sl: sourceLang === 'auto' ? 'auto' : sourceLang,
            tl: targetLang,
            dt: 't',
            q: text
        });

        const response = await fetch(`${url}?${params}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            return data[0].map(item => item[0]).join('');
        }
        
        throw new Error('Invalid response format');
    }

    async libreTranslatePublic(text, sourceLang, targetLang) {
        // Use public LibreTranslate instances
        const publicInstances = [
            'https://libretranslate.de/translate',
            'https://translate.argosopentech.com/translate',
            'https://translate.api.skitzen.com/translate'
        ];

        for (const instance of publicInstances) {
            try {
                const response = await fetch(instance, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        q: text,
                        source: sourceLang === 'auto' ? 'auto' : sourceLang,
                        target: targetLang,
                        format: 'text'
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.translatedText) {
                        return data.translatedText;
                    }
                }
            } catch (error) {
                console.warn(`LibreTranslate instance ${instance} failed:`, error);
                continue;
            }
        }
        
        throw new Error('All LibreTranslate instances failed');
    }

    async lingvaTranslate(text, sourceLang, targetLang) {
        // Use Lingva Translate (Google Translate proxy)
        const instances = [
            'https://lingva.ml/api/v1',
            'https://translate.plausibility.cloud/api/v1',
            'https://lingva.garudalinux.org/api/v1'
        ];

        const source = sourceLang === 'auto' ? 'auto' : sourceLang;
        
        for (const instance of instances) {
            try {
                const url = `${instance}/${source}/${targetLang}/${encodeURIComponent(text)}`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    if (data.translation) {
                        return data.translation;
                    }
                }
            } catch (error) {
                console.warn(`Lingva instance ${instance} failed:`, error);
                continue;
            }
        }
        
        throw new Error('All Lingva instances failed');
    }

    async fallbackTranslation(text, sourceLang, targetLang) {
        // Simple rule-based translation for common phrases
        const commonTranslations = {
            'en-es': {
                'hello': 'hola',
                'goodbye': 'adiós',
                'thank you': 'gracias',
                'please': 'por favor',
                'yes': 'sí',
                'no': 'no',
                'the': 'el/la',
                'and': 'y',
                'or': 'o',
                'but': 'pero',
                'with': 'con',
                'without': 'sin'
            },
            'en-fr': {
                'hello': 'bonjour',
                'goodbye': 'au revoir',
                'thank you': 'merci',
                'please': 's\'il vous plaît',
                'yes': 'oui',
                'no': 'non',
                'the': 'le/la',
                'and': 'et',
                'or': 'ou',
                'but': 'mais',
                'with': 'avec',
                'without': 'sans'
            },
            'en-de': {
                'hello': 'hallo',
                'goodbye': 'auf wiedersehen',
                'thank you': 'danke',
                'please': 'bitte',
                'yes': 'ja',
                'no': 'nein',
                'the': 'der/die/das',
                'and': 'und',
                'or': 'oder',
                'but': 'aber',
                'with': 'mit',
                'without': 'ohne'
            }
        };

        const langPair = `${sourceLang}-${targetLang}`;
        const translations = commonTranslations[langPair];
        
        if (translations) {
            let translatedText = text.toLowerCase();
            for (const [original, translation] of Object.entries(translations)) {
                const regex = new RegExp(`\\b${original}\\b`, 'gi');
                translatedText = translatedText.replace(regex, translation);
            }
            return translatedText;
        }

        // If no fallback available, return original text with a note
        return `[Translation unavailable] ${text}`;
    }

    async translateChunk(chunk, sourceLang, targetLang, onProgress) {
        try {
            const translation = await this.translateText(chunk.content, sourceLang, targetLang);
            chunk.translation = translation;
            chunk.translated = true;
            
            if (onProgress) {
                onProgress(chunk);
            }
            
            return chunk;
        } catch (error) {
            console.error('Chunk translation failed:', error);
            chunk.translation = chunk.content;
            chunk.translated = true;
            
            if (onProgress) {
                onProgress(chunk);
            }
            
            return chunk;
        }
    }

    async translateFile(fileData, sourceLang, targetLang, onProgress, onFileComplete) {
        const startTime = Date.now();
        let completedChunks = 0;
        
        try {
            for (const chunk of fileData.chunks) {
                if (!chunk.translated) {
                    await this.translateChunk(chunk, sourceLang, targetLang, (translatedChunk) => {
                        completedChunks++;
                        if (onProgress) {
                            onProgress({
                                fileName: fileData.name,
                                chunkProgress: completedChunks / fileData.chunks.length,
                                chunk: translatedChunk
                            });
                        }
                    });
                }
            }
            
            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000);
            
            // Add to history
            this.addToHistory({
                fileName: fileData.name,
                sourceLang,
                targetLang,
                timestamp: new Date().toISOString(),
                duration,
                chunkCount: fileData.chunks.length,
                fileSize: fileData.size
            });
            
            if (onFileComplete) {
                onFileComplete(fileData);
            }
            
        } catch (error) {
            console.error(`File translation failed for ${fileData.name}:`, error);
            throw error;
        }
    }

    async translateAllFiles(files, sourceLang, targetLang, onProgress, onFileComplete) {
        const totalChunks = files.reduce((sum, file) => sum + file.chunks.length, 0);
        let completedChunks = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            await this.translateFile(file, sourceLang, targetLang, 
                (progress) => {
                    completedChunks++;
                    if (onProgress) {
                        onProgress({
                            fileIndex: i,
                            fileName: file.name,
                            totalFiles: files.length,
                            overallProgress: completedChunks / totalChunks,
                            fileProgress: progress.chunkProgress,
                            chunk: progress.chunk
                        });
                    }
                },
                onFileComplete
            );
        }
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getCacheKey(text, sourceLang, targetLang) {
        const textHash = this.simpleHash(text);
        return `${sourceLang}-${targetLang}-${textHash}`;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    getFromCache(key) {
        try {
            const cached = localStorage.getItem(`translation_cache_${key}`);
            if (cached) {
                const data = JSON.parse(cached);
                // Check if cache is less than 7 days old
                if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
                    return data.translation;
                }
            }
        } catch (error) {
            console.warn('Cache read error:', error);
        }
        return null;
    }

    saveToCache(key, translation) {
        try {
            const data = {
                translation,
                timestamp: Date.now()
            };
            localStorage.setItem(`translation_cache_${key}`, JSON.stringify(data));
        } catch (error) {
            console.warn('Cache write error:', error);
        }
    }

    addToHistory(entry) {
        this.translationHistory.unshift(entry);
        if (this.translationHistory.length > 10) {
            this.translationHistory = this.translationHistory.slice(0, 10);
        }
        this.saveHistory();
    }

    getHistory() {
        return this.translationHistory;
    }

    loadHistory() {
        try {
            const stored = localStorage.getItem('translation_history');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('History load error:', error);
            return [];
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('translation_history', JSON.stringify(this.translationHistory));
        } catch (error) {
            console.warn('History save error:', error);
        }
    }

    clearHistory() {
        this.translationHistory = [];
        localStorage.removeItem('translation_history');
    }

    clearCache() {
        this.cache.clear();
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('translation_cache_')) {
                keys.push(key);
            }
        }
        keys.forEach(key => localStorage.removeItem(key));
    }

    // Language detection (basic implementation)
    detectLanguage(text) {
        // Simple language detection based on character patterns
        const sample = text.substring(0, 1000).toLowerCase();
        
        // Common patterns for different languages
        const patterns = {
            'en': /\b(the|and|for|are|but|not|you|all|can|her|was|one|our|had|day)\b/g,
            'es': /\b(que|con|una|para|son|por|como|pero|sus|las|los|del|muy)\b/g,
            'fr': /\b(que|des|les|une|dans|est|pour|qui|sur|avec|son|être)\b/g,
            'de': /\b(der|die|und|den|das|von|ist|mit|dem|des|auf|ein)\b/g,
            'it': /\b(che|con|una|per|sono|come|della|anche|dalla|questa)\b/g,
            'pt': /\b(que|com|uma|para|são|como|pela|esta|pela|seus)\b/g,
            'ru': /[а-я]{3,}/g,
            'ja': /[ひらがなカタカナ]/g,
            'ko': /[ㄱ-ㅎㅏ-ㅣ가-힣]/g,
            'zh': /[\u4e00-\u9fff]/g,
            'ar': /[\u0600-\u06ff]/g
        };
        
        let maxMatches = 0;
        let detectedLang = 'auto';
        
        for (const [lang, pattern] of Object.entries(patterns)) {
            const matches = sample.match(pattern);
            const matchCount = matches ? matches.length : 0;
            
            if (matchCount > maxMatches) {
                maxMatches = matchCount;
                detectedLang = lang;
            }
        }
        
        return maxMatches > 3 ? detectedLang : 'auto';
    }

    getSupportedLanguages() {
        return {
            'auto': 'Auto-detect',
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese',
            'ar': 'Arabic',
            'hi': 'Hindi',
            'tr': 'Turkish',
            'pl': 'Polish',
            'nl': 'Dutch',
            'sv': 'Swedish',
            'da': 'Danish',
            'no': 'Norwegian',
            'fi': 'Finnish'
        };
    }
}