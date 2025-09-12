export class SimilarityMatcher {
  /**
   * Calculate similarity between two strings using a modified Levenshtein distance
   * Returns a percentage (0-100) where 100 is an exact match
   */
  static calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    // Normalize strings
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 100;
    
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 100;
    
    const distance = this.levenshteinDistance(s1, s2);
    const similarity = ((maxLength - distance) / maxLength) * 100;
    
    return Math.max(0, Math.round(similarity * 100) / 100);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator  // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Find similar messages based on text content with scope support
   */
  static findSimilarMessages(
    query: string,
    messages: Array<{ id: number; text?: string; mediaFileName?: string }>,
    threshold: number = 70,
    searchInWholeMessage: boolean = true
  ): Array<{ id: number; text?: string; similarity: number }> {
    if (!query.trim()) return [];
    
    const results = messages
      .map(message => {
        let searchText: string;
        
        if (searchInWholeMessage) {
          // Search in whole message (text + filename)
          searchText = (message.text || '') + ' ' + (message.mediaFileName || '');
        } else {
          // Search only in title/filename (first line of text or filename)
          searchText = message.mediaFileName || message.text?.split('\n')[0] || '';
        }
        
        return {
          ...message,
          similarity: this.calculateSimilarity(query, searchText)
        };
      })
      .filter(result => result.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
    
    return results;
  }

  /**
   * Fuzzy search with word-based matching
   */
  static fuzzyWordMatch(query: string, text: string): number {
    if (!query || !text) return 0;
    
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const textWords = text.toLowerCase().split(/\s+/);
    
    if (queryWords.length === 0) return 0;
    
    let matchedWords = 0;
    
    for (const queryWord of queryWords) {
      const bestMatch = Math.max(
        ...textWords.map(textWord => this.calculateSimilarity(queryWord, textWord))
      );
      
      if (bestMatch >= 60) { // Word-level threshold
        matchedWords++;
      }
    }
    
    return (matchedWords / queryWords.length) * 100;
  }

  /**
   * Advanced similarity search with multiple algorithms
   */
  static advancedSimilarity(query: string, text: string): number {
    const exactSimilarity = this.calculateSimilarity(query, text);
    const wordSimilarity = this.fuzzyWordMatch(query, text);
    const containsSimilarity = text.toLowerCase().includes(query.toLowerCase()) ? 90 : 0;
    
    // Weight the different similarity measures
    return Math.max(
      exactSimilarity * 0.4,
      wordSimilarity * 0.4,
      containsSimilarity * 0.2
    );
  }
}
