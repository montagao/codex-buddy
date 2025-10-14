import { describe, expect, it } from 'vitest';
import { applyTemplate, normalizeQuestions, buildReviewSection } from '../src/utils/review.js';

describe('template utilities', () => {
  it('replaces known template tokens', () => {
    const rendered = applyTemplate('Found {{totalVersions}} versions and {{totalFiles}} files.', {
      totalVersions: 3,
      totalFiles: 42,
    });
    expect(rendered).toBe('Found 3 versions and 42 files.');
  });

  it('ignores unknown tokens', () => {
    const rendered = applyTemplate('Hello {{unknown}}', { totalVersions: 1 });
    expect(rendered).toBe('Hello {{unknown}}');
  });
});

describe('review questions', () => {
  it('splits newline-delimited questions', () => {
    const questions = normalizeQuestions('First?\nSecond?\n\nThird?');
    expect(questions).toEqual(['First?', 'Second?', 'Third?']);
  });

  it('builds a review section with numbering and metrics', () => {
    const section = buildReviewSection(
      'Custom Heading',
      ['Q1 for {{totalVersions}} versions', 'Q2'],
      { lineSeparator: '\n---\n', separator: '\n\n', totalVersions: 2, totalFiles: 5 }
    );

    expect(section).toContain('## Custom Heading');
    expect(section).toContain('1. Q1 for 2 versions');
    expect(section).toContain('2. Q2');
  });

  it('falls back when no questions are provided', () => {
    const section = buildReviewSection('', '', { lineSeparator: '\n---\n', separator: '\n\n' });
    expect(section).toMatch(/Add your review questions/);
  });
});
