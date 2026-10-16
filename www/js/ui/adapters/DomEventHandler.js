/**
 * Adaptador de Eventos de Interface (DomEventHandler)
 * Nomenclatura orientada ao tipo do evento com prefixo "_"
 */
export class DomEventHandler {
  _app;

  constructor(app) {
    this._app = app;
  }

  _click(event) {
    const target = event.target.closest('[data-action], button, a');
    if (!target) return;
    const action = target.dataset.action;
    if (action && typeof this._app[action] === 'function') {
      this._app[action](event);
    }
  }

  _submit(event) {
    event.preventDefault();
    const form = event.target;
    const action = form.dataset.action || form.id;
    if (action && typeof this._app[action] === 'function') {
      this._app[action](event);
    }
  }

  _input(event) {
    const target = event.target;
    const action = target.dataset.inputAction;
    if (action && typeof this._app[action] === 'function') {
      this._app[action](event);
    }
  }

  _change(event) {
    const target = event.target;
    const action = target.dataset.changeAction;
    if (action && typeof this._app[action] === 'function') {
      this._app[action](event);
    }
  }

  _keydown(event) {
    this._app.updateLastActivity();
  }

  _pointerdown(event) {
    this._app.updateLastActivity();
  }

  _touchstart(event) {
    this._app.updateLastActivity();
  }

  _visibilitychange(event) {
    if (document.hidden) {
      this._app.handleBackgroundHide();
    }
  }

  bindGlobalListeners() {
    document.addEventListener('pointerdown', e => this._pointerdown(e), { passive: true });
    document.addEventListener('keydown', e => this._keydown(e), { passive: true });
    document.addEventListener('touchstart', e => this._touchstart(e), { passive: true });
    document.addEventListener('visibilitychange', e => this._visibilitychange(e));
  }
}
