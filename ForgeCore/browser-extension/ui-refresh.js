export class RenderGate {
  constructor() {
    this.editing = false;
    this.pending = false;
  }

  beginEdit() {
    this.editing = true;
  }

  requestRender() {
    if (this.editing) {
      this.pending = true;
      return false;
    }
    return true;
  }

  endEdit() {
    this.editing = false;
    const shouldRender = this.pending;
    this.pending = false;
    return shouldRender;
  }
}

export function isNamingEditor(element) {
  if (!element || typeof element.matches !== 'function') return false;
  return element.matches('.namingBox input, .namingBox select');
}
