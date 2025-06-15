import { PhraseUnit, WordUnit, CharUnit } from '../types/types';

/**
 * Calculates and assigns character indices for all characters in lyrics data
 */
export function calculateCharacterIndices(lyrics: PhraseUnit[]): PhraseUnit[] {
  return lyrics.map(phrase => {
    let charIndex = 0;
    let totalChars = 0;
    const totalWords = phrase.words.length;

    // First pass: count total characters
    phrase.words.forEach(word => {
      totalChars += word.chars.length;
    });

    // Second pass: assign indices
    const updatedWords = phrase.words.map(word => {
      const updatedChars = word.chars.map(char => {
        const updatedChar: CharUnit = {
          ...char,
          charIndex: charIndex,
          totalChars: totalChars,
          totalWords: totalWords
        };
        charIndex++;
        return updatedChar;
      });

      return {
        ...word,
        chars: updatedChars
      };
    });

    return {
      ...phrase,
      words: updatedWords
    };
  });
}

/**
 * Updates character indices for a single phrase
 */
export function updatePhraseCharacterIndices(phrase: PhraseUnit): PhraseUnit {
  let charIndex = 0;
  let totalChars = 0;
  const totalWords = phrase.words.length;

  // Count total characters
  phrase.words.forEach(word => {
    totalChars += word.chars.length;
  });

  // Assign indices
  const updatedWords = phrase.words.map(word => {
    const updatedChars = word.chars.map(char => {
      const updatedChar: CharUnit = {
        ...char,
        charIndex: charIndex,
        totalChars: totalChars,
        totalWords: totalWords
      };
      charIndex++;
      return updatedChar;
    });

    return {
      ...word,
      chars: updatedChars
    };
  });

  return {
    ...phrase,
    words: updatedWords
  };
}

/**
 * Validates that all character indices are properly set
 */
export function validateCharacterIndices(lyrics: PhraseUnit[]): boolean {
  for (const phrase of lyrics) {
    let expectedIndex = 0;
    for (const word of phrase.words) {
      for (const char of word.chars) {
        if (char.charIndex !== expectedIndex) {
          console.error(`Invalid charIndex: expected ${expectedIndex}, got ${char.charIndex} for char "${char.char}" in phrase "${phrase.text}"`);
          return false;
        }
        expectedIndex++;
      }
    }
  }
  return true;
}