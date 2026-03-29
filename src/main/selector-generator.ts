/**
 * Generate a stable, readable CSS selector for a DOM element.
 *
 * Priority order:
 * 1. #id (most stable)
 * 2. [data-testid="..."] (testing convention)
 * 3. [data-id="..."] (common pattern)
 * 4. [name="..."] for form inputs
 * 5. [aria-label="..."] (accessible)
 * 6. input[placeholder="..."] for inputs
 * 7. tag.className (if class is specific enough)
 * 8. tag[href="..."] for links
 * 9. #parentId tag (parent context)
 * 10. tag (last resort)
 *
 * This function is designed to work both in Node (for testing)
 * and in the browser (injected via page.evaluate).
 */

interface ElementLike {
  tagName: string;
  id?: string;
  className?: string;
  getAttribute: (name: string) => string | null;
  parentElement: ElementLike | null;
}

export function generateSelector(el: ElementLike): string {
  const tag = el.tagName.toLowerCase();

  // 1. ID
  if (el.id) {
    return `#${el.id}`;
  }

  // 2. data-testid
  const testId = el.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${testId}"]`;
  }

  // 3. data-id
  const dataId = el.getAttribute('data-id');
  if (dataId) {
    return `[data-id="${dataId}"]`;
  }

  // 4. name attribute (form inputs)
  const name = el.getAttribute('name');
  if (name) {
    return `${tag}[name="${name}"]`;
  }

  // 5. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    return `[aria-label="${ariaLabel}"]`;
  }

  // 6. placeholder for inputs
  const placeholder = el.getAttribute('placeholder');
  if (placeholder && (tag === 'input' || tag === 'textarea')) {
    return `${tag}[placeholder="${placeholder}"]`;
  }

  // 7. Specific class names (skip generic ones)
  const genericClasses = new Set([
    'active', 'disabled', 'hidden', 'visible', 'show', 'hide',
    'open', 'closed', 'selected', 'focus', 'hover',
    'container', 'wrapper', 'inner', 'outer', 'content',
    'row', 'col', 'flex', 'grid', 'block', 'inline',
  ]);

  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(/\s+/).filter((c) => c && !genericClasses.has(c));
    if (classes.length > 0) {
      // Prefer longer, more specific class names
      const best = classes.sort((a, b) => b.length - a.length)[0];
      return `${tag}.${best}`;
    }
  }

  // 8. href for links
  const href = el.getAttribute('href');
  if (href && tag === 'a') {
    return `a[href="${href}"]`;
  }

  // 9. Parent context
  if (el.parentElement) {
    const parentSelector = generateSelector(el.parentElement);
    if (parentSelector && parentSelector !== tag) {
      return `${parentSelector} ${tag}`;
    }
  }

  // 10. Just the tag
  return tag;
}

/**
 * JavaScript source code for the selector generator,
 * suitable for injection into a webview via executeJavaScript.
 * This is the same algorithm as above but as a self-contained string.
 */
export const SELECTOR_GENERATOR_SCRIPT = `
(function() {
  window.__purroxyGenerateSelector = function(el) {
    var tag = el.tagName.toLowerCase();
    if (el.id) return '#' + el.id;
    var testId = el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId + '"]';
    var dataId = el.getAttribute('data-id');
    if (dataId) return '[data-id="' + dataId + '"]';
    var name = el.getAttribute('name');
    if (name) return tag + '[name="' + name + '"]';
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return '[aria-label="' + ariaLabel + '"]';
    var placeholder = el.getAttribute('placeholder');
    if (placeholder && (tag === 'input' || tag === 'textarea'))
      return tag + '[placeholder="' + placeholder + '"]';
    if (el.className && typeof el.className === 'string') {
      var generic = ['active','disabled','hidden','visible','show','hide','open','closed',
        'selected','focus','hover','container','wrapper','inner','outer','content',
        'row','col','flex','grid','block','inline'];
      var classes = el.className.split(/\\s+/).filter(function(c) {
        return c && generic.indexOf(c) === -1;
      });
      if (classes.length > 0) {
        classes.sort(function(a, b) { return b.length - a.length; });
        return tag + '.' + classes[0];
      }
    }
    var href = el.getAttribute('href');
    if (href && tag === 'a') return 'a[href="' + href + '"]';
    if (el.parentElement && el.parentElement.id)
      return '#' + el.parentElement.id + ' ' + tag;
    return tag;
  };
})();
`;
