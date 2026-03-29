import { describe, it, expect } from 'vitest';
import { generateSelector } from '../main/selector-generator';

// Test selector generation with a mock DOM-like structure.
// The real implementation runs inside the browser (page.evaluate),
// but we test the algorithm with a simplified DOM.

// Mock element interface matching what the browser provides
interface MockElement {
  tagName: string;
  id?: string;
  className?: string;
  getAttribute: (name: string) => string | null;
  parentElement: MockElement | null;
  children?: MockElement[];
  // For nth-child calculation
  parentChildren?: MockElement[];
  textContent?: string;
}

function makeElement(tag: string, attrs: Record<string, string> = {}, parent?: MockElement): MockElement {
  const el: MockElement = {
    tagName: tag.toUpperCase(),
    id: attrs.id || '',
    className: attrs.class || '',
    getAttribute: (name: string) => attrs[name] || null,
    parentElement: parent || null,
    textContent: attrs._text || '',
  };
  return el;
}

describe('generateSelector', () => {
  it('prefers ID when available', () => {
    const el = makeElement('button', { id: 'submit-btn' });
    expect(generateSelector(el as any)).toBe('#submit-btn');
  });

  it('uses data-testid when available', () => {
    const el = makeElement('div', { 'data-testid': 'login-form' });
    expect(generateSelector(el as any)).toBe('[data-testid="login-form"]');
  });

  it('uses data-id when available', () => {
    const el = makeElement('div', { 'data-id': '42' });
    expect(generateSelector(el as any)).toBe('[data-id="42"]');
  });

  it('uses name attribute for form inputs', () => {
    const el = makeElement('input', { name: 'email', type: 'text' });
    expect(generateSelector(el as any)).toBe('input[name="email"]');
  });

  it('uses unique class name', () => {
    const el = makeElement('button', { class: 'btn-primary submit-form' });
    expect(generateSelector(el as any)).toMatch(/\.btn-primary|\.submit-form/);
  });

  it('combines tag and class for common elements', () => {
    const el = makeElement('a', { class: 'nav-link', href: '/about' });
    const selector = generateSelector(el as any);
    expect(selector).toMatch(/a\.nav-link|a\[href="\/about"\]/);
  });

  it('uses aria-label when available', () => {
    const el = makeElement('button', { 'aria-label': 'Close dialog' });
    expect(generateSelector(el as any)).toBe('[aria-label="Close dialog"]');
  });

  it('uses placeholder for inputs', () => {
    const el = makeElement('input', { placeholder: 'Search...', type: 'text' });
    expect(generateSelector(el as any)).toBe('input[placeholder="Search..."]');
  });

  it('falls back to tag + parent for generic elements', () => {
    const parent = makeElement('div', { id: 'container' });
    const el = makeElement('span', {}, parent);
    const selector = generateSelector(el as any);
    // Should produce something like #container span or just span
    expect(selector.length).toBeGreaterThan(0);
  });
});
