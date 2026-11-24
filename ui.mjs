export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function setNotice(element, message = '', error = false) {
  element.textContent = message;
  element.classList.toggle('error', error);
}
